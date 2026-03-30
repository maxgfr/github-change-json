import * as core from '@actions/core'
import {
  parse,
  modify,
  applyEdits,
  ParseErrorCode,
  type FormattingOptions,
  type ParseError
} from 'jsonc-parser'
import Ajv from 'ajv'
import fs from 'fs/promises'
import path from 'path'

export interface ModifyProperty {
  key: string
  value?: string
  type?: 'string' | 'number' | 'boolean' | 'json'
  delete?: boolean
  merge?: boolean
}

export interface ModifyResult {
  key: string
  oldValue: unknown
  newValue: unknown
}

export interface ModifyFileResult {
  results: ModifyResult[]
  modified: boolean
}

export interface ModifyOptions {
  dryRun?: boolean
  schema?: string
  createIfMissing?: boolean
}

const VALID_TYPES = ['string', 'number', 'boolean', 'json'] as const

const SCHEMA_FETCH_TIMEOUT_MS = 30_000

/**
 * Parses a string value into the appropriate type.
 */
export function parseValue(value: string, type?: string): unknown {
  if (type && !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    throw new Error(
      `Invalid type: '${type}'. Expected one of: ${VALID_TYPES.join(', ')}`
    )
  }
  switch (type) {
    case 'number': {
      if (value.trim() === '')
        throw new Error(`Invalid number value: ${value}`)
      const num = Number(value)
      if (!isFinite(num))
        throw new Error(`Invalid number value: ${value}`)
      return num
    }
    case 'boolean':
      if (value === 'true') return true
      if (value === 'false') return false
      throw new Error(
        `Invalid boolean value: ${value}. Expected 'true' or 'false'`
      )
    case 'json':
      try {
        return JSON.parse(value)
      } catch {
        throw new Error(`Invalid JSON value: ${value}`)
      }
    case 'string':
    default:
      return value
  }
}

/**
 * Converts a dot-notation key to a JSON path array.
 * Supports escaping dots with backslash: "my\\.key" → ["my.key"]
 * Purely numeric segments are treated as array indices.
 */
export function keyToPath(key: string): (string | number)[] {
  const rawSegments: string[] = []
  let current = ''
  for (let i = 0; i < key.length; i++) {
    if (key[i] === '\\' && i + 1 < key.length && key[i + 1] === '.') {
      current += '.'
      i++
    } else if (key[i] === '.') {
      rawSegments.push(current)
      current = ''
    } else {
      current += key[i]
    }
  }
  rawSegments.push(current)

  return rawSegments.map(s => (/^\d+$/.test(s) ? parseInt(s, 10) : s))
}

/**
 * Gets a nested value from an object/array using a path array.
 */
function getNestedValue(
  obj: unknown,
  segments: (string | number)[]
): unknown {
  let current: unknown = obj
  for (const segment of segments) {
    if (
      current === undefined ||
      current === null ||
      typeof current !== 'object'
    ) {
      return undefined
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    current = (current as any)[segment]
  }
  return current
}

/**
 * Deep merges source into target. Objects are recursively merged,
 * arrays and primitives from source overwrite target.
 */
export function deepMerge(target: unknown, source: unknown): unknown {
  if (
    typeof target === 'object' &&
    target !== null &&
    !Array.isArray(target) &&
    typeof source === 'object' &&
    source !== null &&
    !Array.isArray(source)
  ) {
    const result: Record<string, unknown> = {
      ...(target as Record<string, unknown>)
    }
    for (const [key, value] of Object.entries(
      source as Record<string, unknown>
    )) {
      result[key] = deepMerge(result[key], value)
    }
    return result
  }
  return source
}

/**
 * Validates JSON content against a JSON Schema.
 * @param content - The JSON/JSONC content string to validate
 * @param schemaSource - Path to a local schema file or a URL
 */
export async function validateJsonSchema(
  content: string,
  schemaSource: string
): Promise<void> {
  const data = parse(content, undefined, {allowTrailingComma: true})

  let schema: object
  if (
    schemaSource.startsWith('http://') ||
    schemaSource.startsWith('https://')
  ) {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      SCHEMA_FETCH_TIMEOUT_MS
    )
    try {
      const response = await fetch(schemaSource, {
        signal: controller.signal
      })
      if (!response.ok) {
        throw new Error(
          `Failed to fetch schema from ${schemaSource}: ${response.statusText}`
        )
      }
      schema = (await response.json()) as object
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new Error(
          `Schema fetch timed out after ${SCHEMA_FETCH_TIMEOUT_MS / 1000}s: ${schemaSource}`
        )
      }
      throw e
    } finally {
      clearTimeout(timeout)
    }
  } else {
    const schemaPath = path.resolve(process.cwd(), schemaSource)
    try {
      await fs.access(schemaPath)
    } catch {
      throw new Error(`Schema file not found: ${schemaPath}`)
    }
    const schemaContent = await fs.readFile(schemaPath, 'utf8')
    try {
      schema = JSON.parse(schemaContent)
    } catch {
      throw new Error(`Invalid JSON in schema file: ${schemaPath}`)
    }
  }

  const ajv = new Ajv({allErrors: true})
  let validate: ReturnType<typeof ajv.compile>
  try {
    validate = ajv.compile(schema)
  } catch (e) {
    throw new Error(
      `Invalid JSON Schema: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  if (!validate(data)) {
    const errors = validate
      .errors!.map(e => `  - ${e.instancePath || '/'}: ${e.message}`)
      .join('\n')
    throw new Error(`Schema validation failed:\n${errors}`)
  }
}

/**
 * Detects the formatting options (indentation, line endings) from file content.
 */
export function detectFormatting(content: string): FormattingOptions {
  const match = content.match(/^(\s+)["\w]/m)
  let tabSize = 2
  let insertSpaces = true

  if (match) {
    const indent = match[1]
    if (indent.includes('\t')) {
      insertSpaces = false
      tabSize = 1
    } else {
      tabSize = indent.length
      insertSpaces = true
    }
  }

  return {
    tabSize,
    insertSpaces,
    eol: content.includes('\r\n') ? '\r\n' : '\n'
  }
}

/**
 * Modifies a JSON or JSONC file with the given properties.
 * Preserves comments, formatting, indentation, and trailing newlines.
 */
export async function modifyJsonFile(
  fileName: string,
  properties: ModifyProperty[],
  options?: ModifyOptions
): Promise<ModifyFileResult> {
  const filePath = path.resolve(process.cwd(), fileName)

  let fileExists = true
  try {
    await fs.access(filePath)
  } catch {
    fileExists = false
  }

  if (!fileExists && options?.createIfMissing) {
    core.info(`File not found, creating: ${filePath}`)
    await fs.mkdir(path.dirname(filePath), {recursive: true})
    await fs.writeFile(filePath, '{}\n', 'utf8')
  } else if (!fileExists) {
    throw new Error(`File not found: ${filePath}`)
  }

  core.info(`Reading file: ${filePath}`)
  const content = await fs.readFile(filePath, 'utf8')

  const errors: ParseError[] = []
  const parsed = parse(content, errors, {allowTrailingComma: true})

  const criticalErrors = errors.filter(
    e => e.error !== ParseErrorCode.InvalidCommentToken
  )
  if (criticalErrors.length > 0) {
    throw new Error(
      `Failed to parse JSON file: ${filePath}. Parse error at offset ${criticalErrors[0].offset}`
    )
  }

  if (properties.length === 0) {
    return {results: [], modified: false}
  }

  const formattingOptions = detectFormatting(content)
  const results: ModifyResult[] = []
  let modifiedContent = content

  for (const prop of properties) {
    const jsonPath = keyToPath(prop.key)
    const oldValue = getNestedValue(parsed, jsonPath)

    if (prop.delete) {
      core.info(`Deleting ${prop.key}`)
      try {
        const edits = modify(modifiedContent, jsonPath, undefined, {
          formattingOptions
        })
        modifiedContent = applyEdits(modifiedContent, edits)
      } catch (e) {
        throw new Error(
          `Failed to delete '${prop.key}': ${e instanceof Error ? e.message : String(e)}`
        )
      }
      results.push({key: prop.key, oldValue, newValue: undefined})
    } else if (prop.merge) {
      if (prop.value === undefined) {
        throw new Error(`Value is required for merge on key: ${prop.key}`)
      }
      let mergeValue: unknown
      try {
        mergeValue = JSON.parse(prop.value)
      } catch {
        throw new Error(
          `Merge requires a valid JSON value for key: ${prop.key}`
        )
      }
      if (
        typeof mergeValue !== 'object' ||
        mergeValue === null ||
        Array.isArray(mergeValue)
      ) {
        throw new Error(
          `Merge requires a JSON object value for key: ${prop.key}`
        )
      }
      core.info(`Merging into ${prop.key}`)
      const merged = deepMerge(oldValue, mergeValue)
      try {
        const edits = modify(modifiedContent, jsonPath, merged, {
          formattingOptions
        })
        modifiedContent = applyEdits(modifiedContent, edits)
      } catch (e) {
        throw new Error(
          `Failed to merge '${prop.key}': ${e instanceof Error ? e.message : String(e)}`
        )
      }
      results.push({key: prop.key, oldValue, newValue: merged})
    } else {
      if (prop.value === undefined) {
        throw new Error(`Value is required for key: ${prop.key}`)
      }
      const newValue = parseValue(prop.value, prop.type)
      core.info(
        `Setting ${prop.key} = ${prop.value}${prop.type && prop.type !== 'string' ? ` (${prop.type})` : ''}`
      )
      try {
        const edits = modify(modifiedContent, jsonPath, newValue, {
          formattingOptions
        })
        modifiedContent = applyEdits(modifiedContent, edits)
      } catch (e) {
        throw new Error(
          `Failed to set '${prop.key}': ${e instanceof Error ? e.message : String(e)}`
        )
      }
      results.push({key: prop.key, oldValue, newValue})
    }
  }

  const modified = content !== modifiedContent

  // Schema validation (before writing)
  if (options?.schema) {
    core.info(`Validating against schema: ${options.schema}`)
    await validateJsonSchema(modifiedContent, options.schema)
    core.info('Schema validation passed')
  }

  if (options?.dryRun) {
    core.info(`[Dry run] Would update ${fileName}`)
    if (modified) {
      core.info(`[Dry run] New content:\n${modifiedContent}`)
    } else {
      core.info(`[Dry run] No changes detected`)
    }
  } else if (modified) {
    await fs.writeFile(filePath, modifiedContent, 'utf8')
    core.info(`Successfully updated ${fileName}`)
  } else {
    core.info(`No changes needed for ${fileName}`)
  }

  return {results, modified}
}
