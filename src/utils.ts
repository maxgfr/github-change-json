import * as core from '@actions/core'
import fs from 'fs/promises'
import path from 'path'

/**
 * Modifies a JSON file with the given properties.
 * @param fileName - Path to the JSON file (relative to current working directory)
 * @param properties - Array of key-value pairs to update in the JSON file
 * @throws Error if file doesn't exist, cannot be read, or contains invalid JSON
 */
export async function modifyJsonFile(
  fileName: string,
  properties: {key: string; value: string}[]
): Promise<void> {
  const filePath = path.resolve(process.cwd(), fileName)

  // Check if file exists before attempting to read
  try {
    await fs.access(filePath)
  } catch {
    throw new Error(`File not found: ${filePath}`)
  }

  core.info(`Reading file: ${filePath}`)
  const file = await fs.readFile(filePath, 'utf8')

  let newFile: Record<string, unknown>
  try {
    newFile = JSON.parse(file)
  } catch (error) {
    throw new Error(
      `Failed to parse JSON file: ${filePath}. ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  for (const prop of properties) {
    core.info(`Setting ${prop.key} = ${prop.value}`)
    newFile[prop.key] = prop.value
  }

  await fs.writeFile(filePath, JSON.stringify(newFile, null, 2), 'utf8')
  core.info(`Successfully updated ${fileName}`)
}
