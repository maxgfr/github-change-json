import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import {
  modifyJsonFile,
  parseValue,
  keyToPath,
  detectFormatting,
  deepMerge,
  validateJsonSchema
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

  it('should reject NaN and Infinity as numbers', () => {
    expect(() => parseValue('NaN', 'number')).toThrow('Invalid number value')
    expect(() => parseValue('Infinity', 'number')).toThrow(
      'Invalid number value'
    )
    expect(() => parseValue('-Infinity', 'number')).toThrow(
      'Invalid number value'
    )
  })

  it('should parse boolean type', () => {
    expect(parseValue('true', 'boolean')).toBe(true)
    expect(parseValue('false', 'boolean')).toBe(false)
  })

  it('should throw on invalid boolean', () => {
    expect(() => parseValue('yes', 'boolean')).toThrow('Invalid boolean value')
    expect(() => parseValue('1', 'boolean')).toThrow('Invalid boolean value')
    expect(() => parseValue('TRUE', 'boolean')).toThrow('Invalid boolean value')
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
    expect(() => parseValue('hello', 'integer')).toThrow(
      "Invalid type: 'integer'"
    )
    expect(() => parseValue('hello', 'float')).toThrow("Invalid type: 'float'")
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

  it('should convert numeric segments to numbers (array indices)', () => {
    expect(keyToPath('items.0')).toEqual(['items', 0])
    expect(keyToPath('items.0.name')).toEqual(['items', 0, 'name'])
    expect(keyToPath('a.1.b.2.c')).toEqual(['a', 1, 'b', 2, 'c'])
  })

  it('should not convert non-numeric segments', () => {
    expect(keyToPath('items.0a')).toEqual(['items', '0a'])
    expect(keyToPath('items.abc')).toEqual(['items', 'abc'])
  })
})

describe('deepMerge', () => {
  it('should merge two flat objects', () => {
    expect(deepMerge({a: 1, b: 2}, {b: 3, c: 4})).toEqual({a: 1, b: 3, c: 4})
  })

  it('should recursively merge nested objects', () => {
    const target = {a: {x: 1, y: 2}, b: 1}
    const source = {a: {y: 3, z: 4}}
    expect(deepMerge(target, source)).toEqual({a: {x: 1, y: 3, z: 4}, b: 1})
  })

  it('should replace arrays (not merge them)', () => {
    expect(deepMerge({a: [1, 2]}, {a: [3, 4, 5]})).toEqual({a: [3, 4, 5]})
  })

  it('should replace primitives', () => {
    expect(deepMerge({a: 'old'}, {a: 'new'})).toEqual({a: 'new'})
  })

  it('should handle undefined target (new key)', () => {
    expect(deepMerge(undefined, {a: 1})).toEqual({a: 1})
  })

  it('should handle null target', () => {
    expect(deepMerge(null, {a: 1})).toEqual({a: 1})
  })

  it('should replace primitive target with object source', () => {
    expect(deepMerge('hello', {a: 1})).toEqual({a: 1})
  })

  it('should deeply merge 3 levels', () => {
    const target = {a: {b: {c: 1, d: 2}, e: 3}}
    const source = {a: {b: {c: 99}}}
    expect(deepMerge(target, source)).toEqual({a: {b: {c: 99, d: 2}, e: 3}})
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

describe('validateJsonSchema', () => {
  let tempDir: string

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'github-change-json-schema-')
    )
  })

  afterAll(async () => {
    try {
      await fs.rm(tempDir, {recursive: true, force: true})
    } catch {
      // Ignore
    }
  })

  it('should pass valid content against schema', async () => {
    const schema = {
      type: 'object',
      required: ['name', 'version'],
      properties: {
        name: {type: 'string'},
        version: {type: 'string'}
      }
    }
    const schemaPath = path.join(tempDir, 'valid.schema.json')
    await fs.writeFile(schemaPath, JSON.stringify(schema), 'utf8')

    const content = JSON.stringify({name: 'test', version: '1.0.0'})

    await expect(validateJsonSchema(content, schemaPath)).resolves.not.toThrow()
  })

  it('should fail when required field is missing', async () => {
    const schema = {
      type: 'object',
      required: ['name', 'version'],
      properties: {
        name: {type: 'string'},
        version: {type: 'string'}
      }
    }
    const schemaPath = path.join(tempDir, 'required.schema.json')
    await fs.writeFile(schemaPath, JSON.stringify(schema), 'utf8')

    const content = JSON.stringify({name: 'test'})

    await expect(validateJsonSchema(content, schemaPath)).rejects.toThrow(
      'Schema validation failed'
    )
  })

  it('should fail when type is wrong', async () => {
    const schema = {
      type: 'object',
      properties: {
        port: {type: 'number'}
      }
    }
    const schemaPath = path.join(tempDir, 'type.schema.json')
    await fs.writeFile(schemaPath, JSON.stringify(schema), 'utf8')

    const content = JSON.stringify({port: 'not-a-number'})

    await expect(validateJsonSchema(content, schemaPath)).rejects.toThrow(
      'Schema validation failed'
    )
  })

  it('should throw on non-existent schema file', async () => {
    const content = JSON.stringify({name: 'test'})
    await expect(
      validateJsonSchema(content, path.join(tempDir, 'nope.json'))
    ).rejects.toThrow('Schema file not found')
  })

  it('should throw on invalid JSON schema file', async () => {
    const schemaPath = path.join(tempDir, 'bad.schema.json')
    await fs.writeFile(schemaPath, 'not json', 'utf8')

    const content = JSON.stringify({name: 'test'})
    await expect(validateJsonSchema(content, schemaPath)).rejects.toThrow(
      'Invalid JSON in schema file'
    )
  })

  it('should validate JSONC content', async () => {
    const schema = {
      type: 'object',
      required: ['name'],
      properties: {name: {type: 'string'}}
    }
    const schemaPath = path.join(tempDir, 'jsonc.schema.json')
    await fs.writeFile(schemaPath, JSON.stringify(schema), 'utf8')

    const content = '{\n  // comment\n  "name": "test"\n}'

    await expect(validateJsonSchema(content, schemaPath)).resolves.not.toThrow()
  })

  describe('schema drafts', () => {
    it('should support a draft 2020-12 schema', async () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        required: ['name'],
        properties: {
          name: {type: 'string'},
          tags: {type: 'array', prefixItems: [{type: 'string'}]}
        }
      }
      const schemaPath = path.join(tempDir, '2020-12.schema.json')
      await fs.writeFile(schemaPath, JSON.stringify(schema), 'utf8')

      const content = JSON.stringify({name: 'test', tags: ['a', 'b']})

      await expect(
        validateJsonSchema(content, schemaPath)
      ).resolves.not.toThrow()
    })

    it('should enforce 2020-12 keywords like prefixItems', async () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          tags: {type: 'array', prefixItems: [{type: 'string'}]}
        }
      }
      const schemaPath = path.join(tempDir, '2020-12-fail.schema.json')
      await fs.writeFile(schemaPath, JSON.stringify(schema), 'utf8')

      const content = JSON.stringify({tags: [123]})

      await expect(validateJsonSchema(content, schemaPath)).rejects.toThrow(
        'Schema validation failed'
      )
    })

    it('should support a draft 2019-09 schema', async () => {
      const schema = {
        $schema: 'https://json-schema.org/draft/2019-09/schema',
        type: 'object',
        required: ['name'],
        properties: {name: {type: 'string'}}
      }
      const schemaPath = path.join(tempDir, '2019-09.schema.json')
      await fs.writeFile(schemaPath, JSON.stringify(schema), 'utf8')

      await expect(
        validateJsonSchema(JSON.stringify({name: 'test'}), schemaPath)
      ).resolves.not.toThrow()
      await expect(
        validateJsonSchema(JSON.stringify({}), schemaPath)
      ).rejects.toThrow('Schema validation failed')
    })

    it('should still support draft-07 schemas with an explicit $schema', async () => {
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        required: ['name'],
        properties: {name: {type: 'string'}}
      }
      const schemaPath = path.join(tempDir, 'draft-07.schema.json')
      await fs.writeFile(schemaPath, JSON.stringify(schema), 'utf8')

      await expect(
        validateJsonSchema(JSON.stringify({name: 'test'}), schemaPath)
      ).resolves.not.toThrow()
    })
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

    it('should report oldValue from the current document state for repeated keys', async () => {
      const {results} = await modifyJsonFile('test.json', [
        {key: 'name', value: 'first'},
        {key: 'name', value: 'second'}
      ])

      expect(results[0].oldValue).toBe('test')
      expect(results[0].newValue).toBe('first')
      expect(results[1].oldValue).toBe('first')
      expect(results[1].newValue).toBe('second')
    })

    it('should report oldValue set by an earlier change on a nested path', async () => {
      const {results} = await modifyJsonFile('test.json', [
        {key: 'nested.value', value: 'updated'},
        {key: 'nested.value', delete: true}
      ])

      expect(results[1].oldValue).toBe('updated')
      expect(results[1].newValue).toBeUndefined()
    })

    it('should merge on top of a value set earlier in the same batch', async () => {
      const {results} = await modifyJsonFile('test.json', [
        {key: 'config', value: '{"host":"localhost"}', type: 'json'},
        {key: 'config', value: '{"port":8080}', merge: true}
      ])

      expect(results[1].oldValue).toEqual({host: 'localhost'})
      expect(results[1].newValue).toEqual({host: 'localhost', port: 8080})

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)
      expect(json.config).toEqual({host: 'localhost', port: 8080})
    })
  })

  describe('nested key support', () => {
    it('should modify existing nested key', async () => {
      await modifyJsonFile('test.json', [{key: 'nested.value', value: 'new'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.nested.value).toBe('new')
    })

    it('should create intermediate objects for deep nesting', async () => {
      await modifyJsonFile('test.json', [{key: 'a.b.c', value: 'deep'}])

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
      await modifyJsonFile('test.json', [{key: 'a.b.c.d.e.f', value: 'deep'}])

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

  describe('array index support', () => {
    beforeEach(async () => {
      await fs.writeFile(
        testFilePath,
        JSON.stringify(
          {
            items: ['apple', 'banana', 'cherry'],
            users: [
              {name: 'Alice', age: 30},
              {name: 'Bob', age: 25}
            ]
          },
          null,
          2
        )
      )
    })

    it('should modify an array element by index', async () => {
      await modifyJsonFile('test.json', [{key: 'items.1', value: 'blueberry'}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.items[1]).toBe('blueberry')
      expect(json.items[0]).toBe('apple')
      expect(json.items[2]).toBe('cherry')
    })

    it('should modify a nested field in an array element', async () => {
      await modifyJsonFile('test.json', [
        {key: 'users.0.name', value: 'Alicia'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.users[0].name).toBe('Alicia')
      expect(json.users[0].age).toBe(30)
      expect(json.users[1].name).toBe('Bob')
    })

    it('should set typed values in array elements', async () => {
      await modifyJsonFile('test.json', [
        {key: 'users.1.age', value: '26', type: 'number'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.users[1].age).toBe(26)
    })

    it('should return old value for array element', async () => {
      const {results} = await modifyJsonFile('test.json', [
        {key: 'items.0', value: 'avocado'}
      ])

      expect(results[0].oldValue).toBe('apple')
    })

    it('should delete an array element', async () => {
      await modifyJsonFile('test.json', [{key: 'users.1', delete: true}])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.users).toHaveLength(1)
      expect(json.users[0].name).toBe('Alice')
    })
  })

  describe('merge mode', () => {
    beforeEach(async () => {
      await fs.writeFile(
        testFilePath,
        JSON.stringify(
          {
            name: 'test',
            scripts: {build: 'tsc', test: 'jest', lint: 'eslint'},
            nested: {a: {x: 1, y: 2}, b: 'hello'}
          },
          null,
          2
        )
      )
    })

    it('should merge new keys into existing object', async () => {
      await modifyJsonFile('test.json', [
        {key: 'scripts', value: '{"start": "node index.js"}', merge: true}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.scripts.build).toBe('tsc')
      expect(json.scripts.test).toBe('jest')
      expect(json.scripts.lint).toBe('eslint')
      expect(json.scripts.start).toBe('node index.js')
    })

    it('should overwrite existing keys during merge', async () => {
      await modifyJsonFile('test.json', [
        {key: 'scripts', value: '{"build": "esbuild"}', merge: true}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.scripts.build).toBe('esbuild')
      expect(json.scripts.test).toBe('jest')
      expect(json.scripts.lint).toBe('eslint')
    })

    it('should deeply merge nested objects', async () => {
      await modifyJsonFile('test.json', [
        {key: 'nested', value: '{"a": {"z": 3}}', merge: true}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.nested.a.x).toBe(1)
      expect(json.nested.a.y).toBe(2)
      expect(json.nested.a.z).toBe(3)
      expect(json.nested.b).toBe('hello')
    })

    it('should merge into non-existent key (creates it)', async () => {
      await modifyJsonFile('test.json', [
        {key: 'config', value: '{"host": "localhost"}', merge: true}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.config).toEqual({host: 'localhost'})
    })

    it('should return old and new values for merge', async () => {
      const {results} = await modifyJsonFile('test.json', [
        {key: 'scripts', value: '{"start": "node ."}', merge: true}
      ])

      expect(results[0].oldValue).toEqual({
        build: 'tsc',
        test: 'jest',
        lint: 'eslint'
      })
      expect(results[0].newValue).toEqual({
        build: 'tsc',
        test: 'jest',
        lint: 'eslint',
        start: 'node .'
      })
    })

    it('should throw on non-JSON merge value', async () => {
      await expect(
        modifyJsonFile('test.json', [
          {key: 'scripts', value: 'not json', merge: true}
        ])
      ).rejects.toThrow('Merge requires a valid JSON value')
    })

    it('should throw on non-object merge value', async () => {
      await expect(
        modifyJsonFile('test.json', [
          {key: 'scripts', value: '[1,2,3]', merge: true}
        ])
      ).rejects.toThrow('Merge requires a JSON object value')
    })

    it('should throw on missing value for merge', async () => {
      await expect(
        modifyJsonFile('test.json', [{key: 'scripts', merge: true}])
      ).rejects.toThrow('Value is required for merge')
    })

    it('should work in changes array', async () => {
      await modifyJsonFile('test.json', [
        {key: 'scripts', value: '{"deploy": "fly deploy"}', merge: true},
        {key: 'name', value: 'updated'}
      ])

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)

      expect(json.scripts.deploy).toBe('fly deploy')
      expect(json.scripts.build).toBe('tsc')
      expect(json.name).toBe('updated')
    })
  })

  describe('schema validation', () => {
    let schemaPath: string

    beforeEach(async () => {
      schemaPath = path.join(tempDir, 'schema.json')
      await fs.writeFile(
        schemaPath,
        JSON.stringify({
          type: 'object',
          required: ['name', 'version'],
          properties: {
            name: {type: 'string', minLength: 1},
            version: {type: 'string'}
          }
        }),
        'utf8'
      )
    })

    it('should pass when modification produces valid result', async () => {
      await expect(
        modifyJsonFile('test.json', [{key: 'name', value: 'valid-name'}], {
          schema: 'schema.json'
        })
      ).resolves.toBeDefined()
    })

    it('should reject when modification violates schema (missing required)', async () => {
      await expect(
        modifyJsonFile('test.json', [{key: 'version', delete: true}], {
          schema: 'schema.json'
        })
      ).rejects.toThrow('Schema validation failed')
    })

    it('should reject when modification violates schema (wrong type)', async () => {
      await fs.writeFile(
        schemaPath,
        JSON.stringify({
          type: 'object',
          properties: {
            name: {type: 'number'}
          }
        }),
        'utf8'
      )

      await expect(
        modifyJsonFile('test.json', [{key: 'name', value: 'still-a-string'}], {
          schema: 'schema.json'
        })
      ).rejects.toThrow('Schema validation failed')
    })

    it('should not write file when schema validation fails', async () => {
      const originalContent = await fs.readFile(testFilePath, 'utf8')

      try {
        await modifyJsonFile('test.json', [{key: 'version', delete: true}], {
          schema: 'schema.json'
        })
      } catch {
        // Expected
      }

      const content = await fs.readFile(testFilePath, 'utf8')
      expect(content).toBe(originalContent)
    })

    it('should validate in dry-run mode too', async () => {
      await expect(
        modifyJsonFile('test.json', [{key: 'version', delete: true}], {
          schema: 'schema.json',
          dryRun: true
        })
      ).rejects.toThrow('Schema validation failed')
    })

    it('should throw on missing schema file', async () => {
      await expect(
        modifyJsonFile('test.json', [{key: 'name', value: 'val'}], {
          schema: 'nonexistent.schema.json'
        })
      ).rejects.toThrow('Schema file not found')
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

      await modifyJsonFile('test.json', [{key: 'name', value: 'modified'}], {
        dryRun: true
      })

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
      const content4space = '{\n    "name": "test",\n    "version": "1.0.0"\n}'
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
      const contentCRLF = '{\r\n  "name": "test",\r\n  "version": "1.0.0"\r\n}'
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

  describe('create-if-missing', () => {
    it('should create file with empty object if it does not exist', async () => {
      const newFile = path.join(tempDir, 'new-config.json')

      await modifyJsonFile(
        'new-config.json',
        [{key: 'name', value: 'created'}],
        {createIfMissing: true}
      )

      const content = await fs.readFile(newFile, 'utf8')
      const json = JSON.parse(content)
      expect(json.name).toBe('created')

      await fs.unlink(newFile)
    })

    it('should create parent directories if needed', async () => {
      const deepPath = path.join(tempDir, 'deep', 'nested', 'config.json')

      await modifyJsonFile(
        'deep/nested/config.json',
        [{key: 'key', value: 'value'}],
        {createIfMissing: true}
      )

      const content = await fs.readFile(deepPath, 'utf8')
      const json = JSON.parse(content)
      expect(json.key).toBe('value')

      await fs.rm(path.join(tempDir, 'deep'), {recursive: true, force: true})
    })

    it('should not create file if it already exists', async () => {
      await modifyJsonFile('test.json', [{key: 'name', value: 'modified'}], {
        createIfMissing: true
      })

      const content = await fs.readFile(testFilePath, 'utf8')
      const json = JSON.parse(content)
      expect(json.name).toBe('modified')
      expect(json.version).toBe('1.0.0')
    })

    it('should still throw without create-if-missing flag', async () => {
      await expect(
        modifyJsonFile('nonexistent.json', [{key: 'name', value: 'val'}])
      ).rejects.toThrow('File not found')
    })
  })
})
