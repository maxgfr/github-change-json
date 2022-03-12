import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {modifyPackageJson} from './utils'

const run = async (): Promise<void> => {
  try {
    core.info('Setting input and environment variables')
    const isCommit = core.getInput('commit')
    const path = core.getInput('path', {required: true})
    const key = core.getInput('key', {required: true})
    const value = core.getInput('value', {required: true})

    await modifyPackageJson(path, [{key, value}])

    if (isCommit) {
      core.info('Committing file changes')
      await exec.exec('git', [
        'config',
        '--global',
        'user.name',
        process.env.GITHUB_ACTOR ?? ''
      ])
      await exec.exec('git', [
        'config',
        '--global',
        'user.email',
        `${process.env.GITHUB_ACTOR}@users.noreply.github.com`
      ])
      await exec.exec('git', [
        'commit',
        '-am',
        `fix: update ${path} with ${key}=${value}`,
        '--no-verify'
      ])
      await exec.exec('git', [
        'push',
        'origin',
        `HEAD:${process.env.GITHUB_BASE_REF}`
      ])
      core.info('Updated files version successfully')
    } else {
      core.info('Skipping commit files')
    }
  } catch (e: any) {
    core.setFailed(e.message)
  }
}

run()
