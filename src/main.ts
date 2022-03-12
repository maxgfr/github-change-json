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
        'commit',
        '-am',
        `fix: update ${path} with ${key}=${value}`
      ])
      await exec.exec('git', ['push'])
      core.info('Updated files version successfully')
    } else {
      core.info('Skipping commit files')
    }
  } catch (e: any) {
    core.setFailed(e.message)
  }
}

run()
