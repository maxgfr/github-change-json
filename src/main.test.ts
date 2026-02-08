import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {run} from './main'

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  getInput: jest.fn(),
  getBooleanInput: jest.fn(),
  setFailed: jest.fn()
}))

// Mock @actions/exec
jest.mock('@actions/exec', () => ({
  exec: jest.fn()
}))

// Mock fs/promises
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn()
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

  // Import fs after mocking
  let fs: typeof import('fs/promises')

  beforeEach(async () => {
    jest.clearAllMocks()

    // Import mocked fs
    fs = await import('fs/promises')

    // Setup default mock returns
    mockGetInput.mockImplementation(name => {
      if (name === 'path') return 'test.json'
      if (name === 'key') return 'name'
      if (name === 'value') return 'test-value'
      return ''
    })
    mockGetBooleanInput.mockReturnValue(false)
    mockExec.mockResolvedValue(0)

    // Setup fs mocks
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
      mockGetBooleanInput.mockReturnValue(false)

      await run()

      expect(mockExec).not.toHaveBeenCalled()
      expect(fs.writeFile).toHaveBeenCalled()
    })

    it('should log skip message when commit is false', async () => {
      mockGetBooleanInput.mockReturnValue(false)

      await run()

      expect(mockInfo).toHaveBeenCalledWith('Skipping commit files')
    })
  })

  describe('when commit is true', () => {
    beforeEach(() => {
      mockGetBooleanInput.mockReturnValue(true)
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

  describe('input validation', () => {
    it('should pass required inputs correctly', async () => {
      await run()

      expect(fs.readFile).toHaveBeenCalled()
      expect(fs.writeFile).toHaveBeenCalled()
    })
  })
})
