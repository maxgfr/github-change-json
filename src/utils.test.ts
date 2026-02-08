import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import {modifyJsonFile} from './utils'

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
}))

// Mock process.cwd to use a temp directory
const originalCwd = process.cwd

describe('modifyJsonFile', () => {
  let tempDir: string
  let testFilePath: string

  beforeAll(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'github-change-json-'))
    process.cwd = jest.fn(() => tempDir)
  })

  afterAll(async () => {
    process.cwd = originalCwd
    // Clean up temp directory
    try {
      await fs.rm(tempDir, {recursive: true, force: true})
    } catch {
      // Ignore cleanup errors
    }
  })

  beforeEach(async () => {
    // Create a test JSON file before each test
    testFilePath = path.join(tempDir, 'test.json')
    await fs.writeFile(
      testFilePath,
      JSON.stringify(
        {name: 'test', version: '1.0.0', nested: {value: 'old'}},
        null,
        2
      )
    )
  })

  afterEach(async () => {
    // Clean up test file after each test
    try {
      await fs.unlink(testFilePath)
    } catch {
      // Ignore if file doesn't exist
    }
  })

  describe('successful modifications', () => {
    it('should modify a single key-value pair', async () => {
      await modifyJsonFile('test.json', [{key: 'name', value: 'modified'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.name).toBe('modified')
      expect(json.version).toBe('1.0.0')
    })

    it('should modify multiple key-value pairs', async () => {
      await modifyJsonFile('test.json', [
        {key: 'name', value: 'modified'},
        {key: 'version', value: '2.0.0'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.name).toBe('modified')
      expect(json.version).toBe('2.0.0')
    })

    it('should add new keys that do not exist', async () => {
      await modifyJsonFile('test.json', [{key: 'newKey', value: 'newValue'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.newKey).toBe('newValue')
      expect(json.name).toBe('test')
    })

    it('should preserve JSON formatting with 2-space indentation', async () => {
      await modifyJsonFile('test.json', [{key: 'name', value: 'modified'}])

      const content = await fs.readFile(testFilePath, 'utf8')

      expect(content).toContain('  "name": "modified"')
    })

    it('should handle numeric values as strings', async () => {
      await modifyJsonFile('test.json', [{key: 'port', value: '3000'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.port).toBe('3000')
    })

    it('should handle boolean values as strings', async () => {
      await modifyJsonFile('test.json', [{key: 'enabled', value: 'true'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.enabled).toBe('true')
    })

    it('should handle null values', async () => {
      await modifyJsonFile('test.json', [{key: 'nullable', value: 'null'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.nullable).toBe('null')
    })

    it('should handle objects as JSON strings', async () => {
      await modifyJsonFile('test.json', [
        {key: 'config', value: '{"key":"value"}'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.config).toBe('{"key":"value"}')
    })
  })

  describe('error handling', () => {
    it('should throw error when file does not exist', async () => {
      await expect(
        modifyJsonFile('nonexistent.json', [{key: 'name', value: 'value'}])
      ).rejects.toThrow('File not found')
    })

    it('should throw error when file contains invalid JSON', async () => {
      await fs.writeFile(testFilePath, 'invalid json content', 'utf8')

      await expect(
        modifyJsonFile('test.json', [{key: 'name', value: 'value'}])
      ).rejects.toThrow('Failed to parse JSON file')
    })

    it('should throw error when file contains malformed JSON', async () => {
      await fs.writeFile(testFilePath, '{"name": "test", broken}', 'utf8')

      await expect(
        modifyJsonFile('test.json', [{key: 'name', value: 'value'}])
      ).rejects.toThrow()
    })
  })

  describe('edge cases', () => {
    it('should handle empty properties array', async () => {
      const originalContent = await fs.readFile(testFilePath, 'utf8')

      await modifyJsonFile('test.json', [])

      const content = await fs.readFile(testFilePath, 'utf8')

      expect(content).toBe(originalContent)
    })

    it('should handle file with only whitespace', async () => {
      await fs.writeFile(testFilePath, '   ', 'utf8')

      await expect(
        modifyJsonFile('test.json', [{key: 'name', value: 'value'}])
      ).rejects.toThrow()
    })

    it('should handle special characters in values', async () => {
      const specialValue = '${{ secrets.MY_SECRET }}'
      await modifyJsonFile('test.json', [{key: 'token', value: specialValue}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.token).toBe(specialValue)
    })

    it('should handle unicode characters in values', async () => {
      await modifyJsonFile('test.json', [{key: 'emoji', value: '🚀'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.emoji).toBe('🚀')
    })

    it('should handle very long values', async () => {
      const longValue = 'a'.repeat(10000)
      await modifyJsonFile('test.json', [{key: 'long', value: longValue}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.long).toBe(longValue)
    })
  })

  describe('package.json specific scenarios', () => {
    beforeEach(async () => {
      await fs.writeFile(
        testFilePath,
        JSON.stringify(
          {
            name: '@scope/package',
            version: '1.0.0',
            scripts: {build: 'tsc', test: 'jest'}
          },
          null,
          2
        )
      )
    })

    it('should modify package name', async () => {
      await modifyJsonFile('test.json', [
        {key: 'name', value: '@scope/new-name'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.name).toBe('@scope/new-name')
    })

    it('should modify version', async () => {
      await modifyJsonFile('test.json', [{key: 'version', value: '2.0.0'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.version).toBe('2.0.0')
    })

    it('should preserve scripts when modifying other keys', async () => {
      await modifyJsonFile('test.json', [{key: 'version', value: '2.0.0'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.scripts).toEqual({build: 'tsc', test: 'jest'})
    })
  })

  describe('file paths', () => {
    it('should handle relative paths', async () => {
      await modifyJsonFile('./test.json', [{key: 'name', value: 'modified'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.name).toBe('modified')
    })

    it('should handle paths with parent directory references', async () => {
      const subDir = path.join(tempDir, 'subdir')
      await fs.mkdir(subDir, {recursive: true})
      const subFile = path.join(subDir, 'test.json')
      await fs.writeFile(
        subFile,
        JSON.stringify({key: 'value'}, null, 2),
        'utf8'
      )

      await modifyJsonFile('subdir/test.json', [
        {key: 'key', value: 'modified'}
      ])

      const content = await fs.readFile(subFile, 'utf8')
      const json = JSON.parse(content)

      expect(json.key).toBe('modified')

      // Cleanup
      await fs.rm(subDir, {recursive: true, force: true})
    })
  })
})
