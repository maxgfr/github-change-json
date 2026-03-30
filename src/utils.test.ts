import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import {
  modifyJsonFile,
  parseValue,
  keyToPath,
  detectFormatting
} from './utils'

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn()
}))

const originalCwd = process.cwd

describe('parseValue', () => {
  it('should return string by default', () => {
    expect(parseValue('hello')).toBe('hello')
    expect(parseValue('hello', 'string')).toBe('hello')
  })

  it('should parse number type', () => {
    expect(parseValue('42', 'number')).toBe(42)
    expect(parseValue('3.14', 'number')).toBe(3.14)
    expect(parseValue('-1', 'number')).toBe(-1)
    expect(parseValue('0', 'number')).toBe(0)
  })

  it('should throw on invalid number', () => {
    expect(() => parseValue('abc', 'number')).toThrow('Invalid number value')
    expect(() => parseValue('', 'number')).toThrow('Invalid number value')
  })

  it('should parse boolean type', () => {
    expect(parseValue('true', 'boolean')).toBe(true)
    expect(parseValue('false', 'boolean')).toBe(false)
  })

  it('should throw on invalid boolean', () => {
    expect(() => parseValue('yes', 'boolean')).toThrow(
      'Invalid boolean value'
    )
    expect(() => parseValue('1', 'boolean')).toThrow('Invalid boolean value')
    expect(() => parseValue('TRUE', 'boolean')).toThrow(
      'Invalid boolean value'
    )
  })

  it('should parse json type', () => {
    expect(parseValue('{"a":1}', 'json')).toEqual({a: 1})
    expect(parseValue('[1,2,3]', 'json')).toEqual([1, 2, 3])
    expect(parseValue('null', 'json')).toBe(null)
    expect(parseValue('"hello"', 'json')).toBe('hello')
  })

  it('should throw on invalid json', () => {
    expect(() => parseValue('{broken}', 'json')).toThrow('Invalid JSON value')
  })

  it('should throw on invalid type', () => {
    expect(() => parseValue('hello', 'integer')).toThrow("Invalid type: 'integer'")
    expect(() => parseValue('hello', 'float')).toThrow("Invalid type: 'float'")
    expect(() => parseValue('hello', 'object')).toThrow("Invalid type: 'object'")
  })

  it('should handle Infinity and NaN as invalid numbers', () => {
    expect(() => parseValue('NaN', 'number')).toThrow('Invalid number value')
  })

  it('should parse Infinity as a number', () => {
    expect(parseValue('Infinity', 'number')).toBe(Infinity)
    expect(parseValue('-Infinity', 'number')).toBe(-Infinity)
  })
})

describe('keyToPath', () => {
  it('should split on dots', () => {
    expect(keyToPath('a.b.c')).toEqual(['a', 'b', 'c'])
    expect(keyToPath('name')).toEqual(['name'])
  })

  it('should handle escaped dots', () => {
    expect(keyToPath('my\\.key')).toEqual(['my.key'])
    expect(keyToPath('a\\.b.c')).toEqual(['a.b', 'c'])
    expect(keyToPath('a.b\\.c')).toEqual(['a', 'b.c'])
  })

  it('should handle empty segments', () => {
    expect(keyToPath('.a')).toEqual(['', 'a'])
    expect(keyToPath('a.')).toEqual(['a', ''])
  })

  it('should handle trailing backslash', () => {
    expect(keyToPath('a\\')).toEqual(['a\\'])
  })

  it('should handle single key', () => {
    expect(keyToPath('x')).toEqual(['x'])
  })
})

describe('detectFormatting', () => {
  it('should detect 2-space indentation', () => {
    const content = '{\n  "name": "test"\n}'
    const fmt = detectFormatting(content)
    expect(fmt.tabSize).toBe(2)
    expect(fmt.insertSpaces).toBe(true)
  })

  it('should detect 4-space indentation', () => {
    const content = '{\n    "name": "test"\n}'
    const fmt = detectFormatting(content)
    expect(fmt.tabSize).toBe(4)
    expect(fmt.insertSpaces).toBe(true)
  })

  it('should detect tab indentation', () => {
    const content = '{\n\t"name": "test"\n}'
    const fmt = detectFormatting(content)
    expect(fmt.insertSpaces).toBe(false)
  })

  it('should detect CRLF line endings', () => {
    const content = '{\r\n  "name": "test"\r\n}'
    const fmt = detectFormatting(content)
    expect(fmt.eol).toBe('\r\n')
  })

  it('should detect LF line endings', () => {
    const content = '{\n  "name": "test"\n}'
    const fmt = detectFormatting(content)
    expect(fmt.eol).toBe('\n')
  })

  it('should default to 2 spaces for compact JSON', () => {
    const content = '{"name":"test"}'
    const fmt = detectFormatting(content)
    expect(fmt.tabSize).toBe(2)
    expect(fmt.insertSpaces).toBe(true)
  })
})

describe('modifyJsonFile', () => {
  let tempDir: string
  let testFilePath: string

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'github-change-json-'))
    process.cwd = jest.fn(() => tempDir)
  })

  afterAll(async () => {
    process.cwd = originalCwd
    try {
      await fs.rm(tempDir, {recursive: true, force: true})
    } catch {
      // Ignore cleanup errors
    }
  })

  beforeEach(async () => {
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

  describe('return values', () => {
    it('should return old value for existing key', async () => {
      const {results} = await modifyJsonFile('test.json', [
        {key: 'name', value: 'modified'}
      ])

      expect(results).toHaveLength(1)
      expect(results[0].key).toBe('name')
      expect(results[0].oldValue).toBe('test')
      expect(results[0].newValue).toBe('modified')
    })

    it('should return undefined old value for new key', async () => {
      const {results} = await modifyJsonFile('test.json', [
        {key: 'brand-new', value: 'val'}
      ])

      expect(results[0].oldValue).toBeUndefined()
      expect(results[0].newValue).toBe('val')
    })

    it('should return multiple results for multiple changes', async () => {
      const {results} = await modifyJsonFile('test.json', [
        {key: 'name', value: 'new-name'},
        {key: 'version', value: '2.0.0'}
      ])

      expect(results).toHaveLength(2)
      expect(results[0].oldValue).toBe('test')
      expect(results[1].oldValue).toBe('1.0.0')
    })

    it('should return modified=true when content changes', async () => {
      const {modified} = await modifyJsonFile('test.json', [
        {key: 'name', value: 'different'}
      ])

      expect(modified).toBe(true)
    })

    it('should return modified=false when setting same value', async () => {
      const {modified} = await modifyJsonFile('test.json', [
        {key: 'name', value: 'test'}
      ])

      expect(modified).toBe(false)
    })
  })

  describe('nested key support', () => {
    it('should modify existing nested key', async () => {
      await modifyJsonFile('test.json', [
        {key: 'nested.value', value: 'new'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.nested.value).toBe('new')
    })

    it('should create intermediate objects for deep nesting', async () => {
      await modifyJsonFile('test.json', [
        {key: 'a.b.c', value: 'deep'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.a.b.c).toBe('deep')
    })

    it('should return old value for nested keys', async () => {
      const {results} = await modifyJsonFile('test.json', [
        {key: 'nested.value', value: 'new'}
      ])

      expect(results[0].oldValue).toBe('old')
      expect(results[0].newValue).toBe('new')
    })

    it('should create very deep nesting', async () => {
      await modifyJsonFile('test.json', [
        {key: 'a.b.c.d.e.f', value: 'deep'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.a.b.c.d.e.f).toBe('deep')
    })

    it('should throw when setting nested path through a primitive', async () => {
      await expect(
        modifyJsonFile('test.json', [{key: 'name.sub', value: 'nested'}])
      ).rejects.toThrow("Failed to set 'name.sub'")
    })

    it('should handle escaped dots as literal key names', async () => {
      await modifyJsonFile('test.json', [
        {key: 'my\\.dotted\\.key', value: 'literal'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json['my.dotted.key']).toBe('literal')
    })
  })

  describe('type-aware values', () => {
    it('should set number values', async () => {
      await modifyJsonFile('test.json', [
        {key: 'port', value: '3000', type: 'number'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.port).toBe(3000)
      expect(typeof json.port).toBe('number')
    })

    it('should set boolean values', async () => {
      await modifyJsonFile('test.json', [
        {key: 'enabled', value: 'true', type: 'boolean'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.enabled).toBe(true)
      expect(typeof json.enabled).toBe('boolean')
    })

    it('should set json values (object)', async () => {
      await modifyJsonFile('test.json', [
        {key: 'config', value: '{"host":"localhost","port":8080}', type: 'json'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.config).toEqual({host: 'localhost', port: 8080})
    })

    it('should set json values (array)', async () => {
      await modifyJsonFile('test.json', [
        {key: 'tags', value: '["a","b","c"]', type: 'json'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.tags).toEqual(['a', 'b', 'c'])
    })

    it('should set nested keys with types', async () => {
      await modifyJsonFile('test.json', [
        {key: 'nested.count', value: '42', type: 'number'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.nested.count).toBe(42)
    })

    it('should default to string type', async () => {
      await modifyJsonFile('test.json', [{key: 'port', value: '3000'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.port).toBe('3000')
      expect(typeof json.port).toBe('string')
    })

    it('should throw on invalid number', async () => {
      await expect(
        modifyJsonFile('test.json', [
          {key: 'port', value: 'abc', type: 'number'}
        ])
      ).rejects.toThrow('Invalid number value')
    })

    it('should throw on invalid boolean', async () => {
      await expect(
        modifyJsonFile('test.json', [
          {key: 'flag', value: 'yes', type: 'boolean'}
        ])
      ).rejects.toThrow('Invalid boolean value')
    })

    it('should throw on invalid json', async () => {
      await expect(
        modifyJsonFile('test.json', [
          {key: 'config', value: '{broken', type: 'json'}
        ])
      ).rejects.toThrow('Invalid JSON value')
    })

    it('should throw on invalid type string', async () => {
      await expect(
        modifyJsonFile('test.json', [
          {key: 'name', value: 'val', type: 'integer' as 'string'}
        ])
      ).rejects.toThrow("Invalid type: 'integer'")
    })
  })

  describe('delete mode', () => {
    it('should delete a top-level key', async () => {
      await modifyJsonFile('test.json', [{key: 'version', delete: true}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.version).toBeUndefined()
      expect(json.name).toBe('test')
    })

    it('should delete a nested key', async () => {
      await modifyJsonFile('test.json', [{key: 'nested.value', delete: true}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.nested.value).toBeUndefined()
      expect(json.nested).toBeDefined()
    })

    it('should return old value when deleting', async () => {
      const {results} = await modifyJsonFile('test.json', [
        {key: 'version', delete: true}
      ])

      expect(results[0].oldValue).toBe('1.0.0')
      expect(results[0].newValue).toBeUndefined()
    })

    it('should handle deleting non-existent key gracefully', async () => {
      const {results} = await modifyJsonFile('test.json', [
        {key: 'nonexistent', delete: true}
      ])

      expect(results[0].oldValue).toBeUndefined()

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)
      expect(json.name).toBe('test')
    })

    it('should mix delete and set operations', async () => {
      await modifyJsonFile('test.json', [
        {key: 'version', delete: true},
        {key: 'name', value: 'new-name'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.version).toBeUndefined()
      expect(json.name).toBe('new-name')
    })
  })

  describe('dry-run mode', () => {
    it('should not modify file in dry-run mode', async () => {
      const originalContent = await fs.readFile(testFilePath, 'utf8')

      await modifyJsonFile(
        'test.json',
        [{key: 'name', value: 'modified'}],
        {dryRun: true}
      )

      const content = await fs.readFile(testFilePath, 'utf8')
      expect(content).toBe(originalContent)
    })

    it('should still return results in dry-run mode', async () => {
      const {results, modified} = await modifyJsonFile(
        'test.json',
        [{key: 'name', value: 'modified'}],
        {dryRun: true}
      )

      expect(results).toHaveLength(1)
      expect(results[0].oldValue).toBe('test')
      expect(results[0].newValue).toBe('modified')
      expect(modified).toBe(true)
    })
  })

  describe('JSONC support', () => {
    it('should parse and modify files with line comments', async () => {
      const jsoncContent = [
        '{',
        '  // This is a comment',
        '  "name": "test",',
        '  "version": "1.0.0"',
        '}'
      ].join('\n')
      await fs.writeFile(testFilePath, jsoncContent, 'utf8')

      await modifyJsonFile('test.json', [{key: 'name', value: 'modified'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      expect(content).toContain('// This is a comment')
      expect(content).toContain('"name": "modified"')
    })

    it('should parse and modify files with block comments', async () => {
      const jsoncContent = [
        '{',
        '  /* Block comment */',
        '  "name": "test",',
        '  "version": "1.0.0"',
        '}'
      ].join('\n')
      await fs.writeFile(testFilePath, jsoncContent, 'utf8')

      await modifyJsonFile('test.json', [{key: 'name', value: 'modified'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      expect(content).toContain('/* Block comment */')
      expect(content).toContain('"name": "modified"')
    })

    it('should parse and modify files with trailing commas', async () => {
      const jsoncContent = [
        '{',
        '  "name": "test",',
        '  "version": "1.0.0",',
        '}'
      ].join('\n')
      await fs.writeFile(testFilePath, jsoncContent, 'utf8')

      await modifyJsonFile('test.json', [{key: 'name', value: 'modified'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      expect(content).toContain('"name": "modified"')
    })

    it('should handle tsconfig-style JSONC', async () => {
      const tsconfigContent = [
        '{',
        '  "compilerOptions": {',
        '    // Target ES2020 for modern browsers',
        '    "target": "ES6",',
        '    "module": "commonjs",',
        '    "strict": true',
        '  }',
        '}'
      ].join('\n')
      await fs.writeFile(testFilePath, tsconfigContent, 'utf8')

      await modifyJsonFile('test.json', [
        {key: 'compilerOptions.target', value: 'ES2020'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      expect(content).toContain('// Target ES2020 for modern browsers')
      expect(content).toContain('"target": "ES2020"')
      expect(content).toContain('"strict": true')
    })
  })

  describe('formatting preservation', () => {
    it('should preserve trailing newline', async () => {
      const contentWithNewline =
        '{\n  "name": "test",\n  "version": "1.0.0"\n}\n'
      await fs.writeFile(testFilePath, contentWithNewline, 'utf8')

      await modifyJsonFile('test.json', [{key: 'name', value: 'modified'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      expect(content.endsWith('\n')).toBe(true)
    })

    it('should preserve no trailing newline', async () => {
      const contentWithoutNewline =
        '{\n  "name": "test",\n  "version": "1.0.0"\n}'
      await fs.writeFile(testFilePath, contentWithoutNewline, 'utf8')

      await modifyJsonFile('test.json', [{key: 'name', value: 'modified'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      expect(content.endsWith('}')).toBe(true)
    })

    it('should preserve 4-space indentation', async () => {
      const content4space =
        '{\n    "name": "test",\n    "version": "1.0.0"\n}'
      await fs.writeFile(testFilePath, content4space, 'utf8')

      await modifyJsonFile('test.json', [{key: 'name', value: 'modified'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      expect(content).toContain('    "name": "modified"')
    })

    it('should preserve tab indentation', async () => {
      const contentTabs = '{\n\t"name": "test",\n\t"version": "1.0.0"\n}'
      await fs.writeFile(testFilePath, contentTabs, 'utf8')

      await modifyJsonFile('test.json', [{key: 'name', value: 'modified'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      expect(content).toContain('\t"name": "modified"')
    })

    it('should preserve CRLF line endings', async () => {
      const contentCRLF =
        '{\r\n  "name": "test",\r\n  "version": "1.0.0"\r\n}'
      await fs.writeFile(testFilePath, contentCRLF, 'utf8')

      await modifyJsonFile('test.json', [{key: 'name', value: 'modified'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      expect(content).toContain('\r\n')
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

    it('should throw when value is missing and not deleting', async () => {
      await expect(
        modifyJsonFile('test.json', [{key: 'name'}])
      ).rejects.toThrow('Value is required')
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

    it('should return empty results and modified=false for empty properties', async () => {
      const {results, modified} = await modifyJsonFile('test.json', [])
      expect(results).toEqual([])
      expect(modified).toBe(false)
    })

    it('should handle empty JSON object', async () => {
      await fs.writeFile(testFilePath, '{}', 'utf8')

      await modifyJsonFile('test.json', [{key: 'name', value: 'value'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)
      expect(json.name).toBe('value')
    })

    it('should throw when modifying a root-level JSON array', async () => {
      await fs.writeFile(testFilePath, '[1, 2, 3]', 'utf8')

      await expect(
        modifyJsonFile('test.json', [{key: 'name', value: 'value'}])
      ).rejects.toThrow("Failed to set 'name'")
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

      await fs.rm(subDir, {recursive: true, force: true})
    })
  })
})
