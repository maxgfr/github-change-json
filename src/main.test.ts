import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {run} from './main'

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  getInput: jest.fn(),
  getBooleanInput: jest.fn(),
  setFailed: jest.fn(),
  setOutput: jest.fn()
}))

jest.mock('@actions/exec', () => ({
  exec: jest.fn()
}))

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn()
}))

// Mock jsonc-parser
jest.mock('jsonc-parser', () => ({
  parse: jest.fn((text: string) => JSON.parse(text)),
  modify: jest.fn(
    (
      text: string,
      path: string[],
      value: unknown
    ): {offset: number; length: number; content: string}[] => {
      const obj = JSON.parse(text)
      let current = obj
      for (let i = 0; i < path.length - 1; i++) {
        if (current[path[i]] === undefined) current[path[i]] = {}
        current = current[path[i]]
      }
      const lastKey = path[path.length - 1]
      if (value === undefined) {
        delete current[lastKey]
      } else {
        current[lastKey] = value
      }
      const newText = JSON.stringify(obj, null, 2)
      return [{offset: 0, length: text.length, content: newText}]
    }
  ),
  applyEdits: jest.fn(
    (
      _text: string,
      edits: {offset: number; length: number; content: string}[]
    ) => {
      if (edits.length === 0) return _text
      return edits[0].content
    }
  ),
  ParseErrorCode: {InvalidCommentToken: 10}
}))

describe('main', () => {
  const mockGetInput = core.getInput as jest.MockedFunction<
    typeof core.getInput
  >
  const mockGetBooleanInput = core.getBooleanInput as jest.MockedFunction<
    typeof core.getBooleanInput
  >
  const mockExec = exec.exec as jest.MockedFunction<typeof exec.exec>
  const mockInfo = core.info as jest.MockedFunction<typeof core.info>
  const mockSetFailed = core.setFailed as jest.MockedFunction<
    typeof core.setFailed
  >
  const mockSetOutput = core.setOutput as jest.MockedFunction<
    typeof core.setOutput
  >

  let fs: typeof import('fs/promises')

  beforeEach(async () => {
    jest.clearAllMocks()

    fs = await import('fs/promises')

    mockGetInput.mockImplementation(name => {
      if (name === 'path') return 'test.json'
      if (name === 'key') return 'name'
      if (name === 'value') return 'test-value'
      if (name === 'type') return 'string'
      if (name === 'changes') return ''
      return ''
    })
    mockGetBooleanInput.mockImplementation(name => {
      if (name === 'commit') return false
      if (name === 'delete') return false
      if (name === 'dry-run') return false
      return false
    })
    mockExec.mockResolvedValue(0)
    ;(fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValue(
      JSON.stringify({name: 'old'}, null, 2)
    )
    ;(
      fs.writeFile as jest.MockedFunction<typeof fs.writeFile>
    ).mockResolvedValue()
    ;(fs.access as jest.MockedFunction<typeof fs.access>).mockResolvedValue()
  })

  describe('when commit is false', () => {
    it('should modify JSON without committing', async () => {
      await run()

      expect(mockExec).not.toHaveBeenCalled()
      expect(fs.writeFile).toHaveBeenCalled()
    })

    it('should log skip message when commit is false', async () => {
      await run()

      expect(mockInfo).toHaveBeenCalledWith('Skipping commit files')
    })
  })

  describe('when commit is true', () => {
    beforeEach(() => {
      mockGetBooleanInput.mockImplementation(name => {
        if (name === 'commit') return true
        if (name === 'delete') return false
        if (name === 'dry-run') return false
        return false
      })
      process.env.GITHUB_ACTOR = 'test-user'
      process.env.GITHUB_REF = 'refs/heads/main'
    })

    afterEach(() => {
      delete process.env.GITHUB_ACTOR
      delete process.env.GITHUB_REF
    })

    it('should configure git and commit changes', async () => {
      await run()

      expect(mockExec).toHaveBeenCalledWith('git', [
        'config',
        '--global',
        'user.name',
        'test-user'
      ])
      expect(mockExec).toHaveBeenCalledWith('git', [
        'config',
        '--global',
        'user.email',
        'test-user@users.noreply.github.com'
      ])
      expect(mockExec).toHaveBeenCalledWith('git', [
        'commit',
        '-am',
        expect.stringContaining('update test.json with name=test-value'),
        '--no-verify'
      ])
    })

    it('should push changes to the correct branch', async () => {
      await run()

      expect(mockExec).toHaveBeenCalledWith('git', [
        'push',
        '-u',
        'origin',
        'HEAD:refs/heads/main'
      ])
    })

    it('should use GITHUB_HEAD_REF for pull requests', async () => {
      process.env.GITHUB_HEAD_REF = 'feature-branch'
      process.env.GITHUB_REF = 'refs/heads/main'

      await run()

      expect(mockExec).toHaveBeenCalledWith('git', [
        'push',
        '-u',
        'origin',
        'HEAD:feature-branch'
      ])
    })

    it('should use default bot name when GITHUB_ACTOR is not set', async () => {
      delete process.env.GITHUB_ACTOR

      await run()

      expect(mockExec).toHaveBeenCalledWith('git', [
        'config',
        '--global',
        'user.name',
        'github-actions[bot]'
      ])
      expect(mockExec).toHaveBeenCalledWith('git', [
        'config',
        '--global',
        'user.email',
        'github-actions@users.noreply.github.com'
      ])
    })

    it('should log success message after committing and pushing', async () => {
      await run()

      expect(mockInfo).toHaveBeenCalledWith(
        'File has been successfully committed and pushed'
      )
    })
  })

  describe('dry-run mode', () => {
    it('should not commit even when commit is true', async () => {
      mockGetBooleanInput.mockImplementation(name => {
        if (name === 'commit') return true
        if (name === 'dry-run') return true
        if (name === 'delete') return false
        return false
      })

      await run()

      expect(mockExec).not.toHaveBeenCalled()
    })

    it('should still set outputs', async () => {
      mockGetBooleanInput.mockImplementation(name => {
        if (name === 'dry-run') return true
        if (name === 'delete') return false
        if (name === 'commit') return false
        return false
      })

      await run()

      expect(mockSetOutput).toHaveBeenCalledWith('old-value', expect.anything())
    })
  })

  describe('delete mode', () => {
    it('should delete a key without requiring value', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'key') return 'name'
        if (name === 'value') return ''
        if (name === 'type') return 'string'
        if (name === 'changes') return ''
        return ''
      })
      mockGetBooleanInput.mockImplementation(name => {
        if (name === 'delete') return true
        if (name === 'commit') return false
        if (name === 'dry-run') return false
        return false
      })

      await run()

      expect(mockSetFailed).not.toHaveBeenCalled()
      expect(fs.writeFile).toHaveBeenCalled()
    })
  })

  describe('changes input', () => {
    it('should parse and apply multiple changes', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'changes')
          return JSON.stringify([
            {key: 'name', value: 'new-name'},
            {key: 'version', value: '2.0.0'}
          ])
        return ''
      })

      await run()

      expect(mockSetFailed).not.toHaveBeenCalled()
      expect(fs.writeFile).toHaveBeenCalled()
    })

    it('should set old-value output as JSON for multiple changes', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'changes')
          return JSON.stringify([
            {key: 'name', value: 'new-name'},
            {key: 'version', value: '2.0.0'}
          ])
        return ''
      })

      await run()

      expect(mockSetOutput).toHaveBeenCalledWith(
        'old-value',
        expect.any(String)
      )
    })

    it('should fail on invalid changes JSON', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'changes') return 'not valid json'
        return ''
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse 'changes' input")
      )
    })

    it('should fail when changes is not an array', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'changes') return '{"key": "name"}'
        return ''
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining("'changes' input must be a JSON array")
      )
    })

    it('should fail when change item is missing key', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'changes')
          return JSON.stringify([{value: 'test'}])
        return ''
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining("must have a 'key' property")
      )
    })

    it('should fail when change item is missing value and not deleting', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'changes')
          return JSON.stringify([{key: 'name'}])
        return ''
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining("must have a 'value' or 'delete: true'")
      )
    })

    it('should accept change with delete flag and no value', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'changes')
          return JSON.stringify([{key: 'name', delete: true}])
        return ''
      })

      await run()

      expect(mockSetFailed).not.toHaveBeenCalled()
    })

    it('should fail when change has null value and no delete flag', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'changes') return '[{"key": "name", "value": null}]'
        return ''
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining("must have a 'value' or 'delete: true'")
      )
    })

    it('should handle empty changes array as no-op', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'changes') return '[]'
        return ''
      })

      await run()

      expect(mockSetFailed).not.toHaveBeenCalled()
      expect(mockSetOutput).toHaveBeenCalledWith('modified', 'false')
    })

    it('should apply type from changes array', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'changes')
          return JSON.stringify([{key: 'port', value: '3000', type: 'number'}])
        return ''
      })

      await run()

      expect(mockSetFailed).not.toHaveBeenCalled()
      expect(fs.writeFile).toHaveBeenCalled()
    })
  })

  describe('type input in single-key mode', () => {
    it('should pass type to modifyJsonFile', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'key') return 'port'
        if (name === 'value') return '3000'
        if (name === 'type') return 'number'
        if (name === 'changes') return ''
        return ''
      })

      await run()

      expect(mockSetFailed).not.toHaveBeenCalled()
      expect(fs.writeFile).toHaveBeenCalled()
    })

    it('should fail on invalid type', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'key') return 'port'
        if (name === 'value') return '3000'
        if (name === 'type') return 'integer'
        if (name === 'changes') return ''
        return ''
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining("Invalid type: 'integer'")
      )
    })
  })

  describe('output', () => {
    it('should set old-value output for single key', async () => {
      await run()

      expect(mockSetOutput).toHaveBeenCalledWith('old-value', 'old')
    })

    it('should set modified output', async () => {
      await run()

      expect(mockSetOutput).toHaveBeenCalledWith(
        'modified',
        expect.any(String)
      )
    })

    it('should JSON.stringify old-value when it is an object', async () => {
      ;(fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValue(
        JSON.stringify({scripts: {build: 'tsc', test: 'jest'}}, null, 2)
      )
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'key') return 'scripts'
        if (name === 'value') return '{"build":"esbuild"}'
        if (name === 'type') return 'json'
        if (name === 'changes') return ''
        return ''
      })

      await run()

      expect(mockSetOutput).toHaveBeenCalledWith(
        'old-value',
        expect.not.stringContaining('[object Object]')
      )
      expect(mockSetOutput).toHaveBeenCalledWith(
        'old-value',
        expect.stringContaining('"build"')
      )
    })
  })

  describe('input validation', () => {
    it('should fail when neither key nor changes is provided', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        return ''
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining("Either 'key' or 'changes' input is required")
      )
    })

    it('should fail when value is missing and not deleting', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'key') return 'name'
        if (name === 'value') return ''
        if (name === 'type') return 'string'
        if (name === 'changes') return ''
        return ''
      })
      mockGetBooleanInput.mockImplementation(name => {
        if (name === 'delete') return false
        if (name === 'commit') return false
        if (name === 'dry-run') return false
        return false
      })

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining("'value' input is required when not deleting")
      )
    })

    it('should pass required inputs correctly', async () => {
      await run()

      expect(fs.readFile).toHaveBeenCalled()
      expect(fs.writeFile).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should set failed action on error', async () => {
      ;(fs.access as jest.MockedFunction<typeof fs.access>).mockRejectedValue(
        new Error('File not found')
      )

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('File not found')
      )
    })

    it('should handle unknown error types', async () => {
      ;(fs.access as jest.MockedFunction<typeof fs.access>).mockRejectedValue(
        'string error'
      )

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        expect.stringContaining('File not found')
      )
    })

    it('should handle null errors', async () => {
      ;(fs.access as jest.MockedFunction<typeof fs.access>).mockRejectedValue(
        null
      )

      await run()

      expect(mockSetFailed).toHaveBeenCalled()
    })
  })

  describe('commit message', () => {
    beforeEach(() => {
      mockGetBooleanInput.mockImplementation(name => {
        if (name === 'commit') return true
        if (name === 'delete') return false
        if (name === 'dry-run') return false
        return false
      })
      process.env.GITHUB_ACTOR = 'test-user'
      process.env.GITHUB_REF = 'refs/heads/main'
    })

    afterEach(() => {
      delete process.env.GITHUB_ACTOR
      delete process.env.GITHUB_REF
    })

    it('should use multi-change commit message for changes input', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'changes')
          return JSON.stringify([
            {key: 'name', value: 'a'},
            {key: 'version', value: 'b'}
          ])
        return ''
      })

      await run()

      expect(mockExec).toHaveBeenCalledWith('git', [
        'commit',
        '-am',
        'chore: update test.json with 2 changes',
        '--no-verify'
      ])
    })

    it('should include delete in commit message for single delete', async () => {
      mockGetInput.mockImplementation(name => {
        if (name === 'path') return 'test.json'
        if (name === 'key') return 'devDependencies'
        if (name === 'value') return ''
        if (name === 'type') return 'string'
        if (name === 'changes') return ''
        return ''
      })
      mockGetBooleanInput.mockImplementation(name => {
        if (name === 'commit') return true
        if (name === 'delete') return true
        if (name === 'dry-run') return false
        return false
      })

      await run()

      expect(mockExec).toHaveBeenCalledWith('git', [
        'commit',
        '-am',
        'chore: update test.json with delete devDependencies',
        '--no-verify'
      ])
    })
  })
})
