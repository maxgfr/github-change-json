import * as core from '@actions/core'
import {
  parse,
  modify,
  applyEdits,
  ParseErrorCode,
  type FormattingOptions,
  type ParseError
} from 'jsonc-parser'
import fs from 'fs/promises'
import path from 'path'

export interface ModifyProperty {
  key: string
  value?: string
  type?: 'string' | 'number' | 'boolean' | 'json'
  delete?: boolean
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
}

/**
 * Parses a string value into the appropriate type.
 */
const VALID_TYPES = ['string', 'number', 'boolean', 'json'] as const

export function parseValue(
  value: string,
  type?: string
): unknown {
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
      if (isNaN(num))
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
 */
export function keyToPath(key: string): string[] {
  const segments: string[] = []
  let current = ''
  for (let i = 0; i < key.length; i++) {
    if (key[i] === '\\' && i + 1 < key.length && key[i + 1] === '.') {
      current += '.'
      i++
    } else if (key[i] === '.') {
      segments.push(current)
      current = ''
    } else {
      current += key[i]
    }
  }
  segments.push(current)
  return segments
}

/**
 * Gets a nested value from an object using a path array.
 */
function getNestedValue(obj: unknown, segments: string[]): unknown {
  let current: unknown = obj
  for (const segment of segments) {
    if (
      current === undefined ||
      current === null ||
      typeof current !== 'object'
    ) {
      return undefined
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return current
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
 *
 * @param fileName - Path to the JSON file (relative to current working directory)
 * @param properties - Array of modifications to apply
 * @param options - Optional settings (dryRun)
 * @returns Array of results with old and new values
 * @throws Error if file doesn't exist, cannot be read, or contains invalid JSON
 */
export async function modifyJsonFile(
  fileName: string,
  properties: ModifyProperty[],
  options?: ModifyOptions
): Promise<ModifyFileResult> {
  const filePath = path.resolve(process.cwd(), fileName)

  try {
    await fs.access(filePath)
  } catch {
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
