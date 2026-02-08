import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {modifyJsonFile} from './utils'

const run = async (): Promise<void> => {
  try {
    core.info('Setting input and environment variables')
    const isCommit = core.getBooleanInput('commit', {required: false})
    const filePath = core.getInput('path', {required: true})
    const key = core.getInput('key', {required: true})
    const value = core.getInput('value', {required: true})

    await modifyJsonFile(filePath, [{key, value}])

    if (isCommit) {
      core.info('Committing file changes')
      await exec.exec('git', [
        'config',
        '--global',
        'user.name',
        process.env.GITHUB_ACTOR ?? 'github-actions[bot]'
      ])
      await exec.exec('git', [
        'config',
        '--global',
        'user.email',
        `${process.env.GITHUB_ACTOR ?? 'github-actions'}@users.noreply.github.com`
      ])
      await exec.exec('git', [
        'commit',
        '-am',
        `chore: update ${filePath} with ${key}=${value}`,
        '--no-verify'
      ])
      await exec.exec('git', [
        'push',
        '-u',
        'origin',
        `HEAD:${process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF}`
      ])
      core.info('File has been successfully committed and pushed')
    } else {
      core.info('Skipping commit files')
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    core.setFailed(message)
  }
}

export {run}

run()
