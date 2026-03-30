import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {modifyJsonFile, type ModifyProperty} from './utils'

export const run = async (): Promise<void> => {
  try {
    core.info('Setting input and environment variables')
    const isCommit = core.getBooleanInput('commit', {required: false})
    const isDryRun = core.getBooleanInput('dry-run', {required: false})
    const filePath = core.getInput('path', {required: true})
    const changesInput = core.getInput('changes', {required: false})

    let properties: ModifyProperty[]

    if (changesInput) {
      try {
        properties = JSON.parse(changesInput)
      } catch (e) {
        throw new Error(
          `Failed to parse 'changes' input: ${e instanceof Error ? e.message : String(e)}`
        )
      }
      if (!Array.isArray(properties)) {
        throw new Error("'changes' input must be a JSON array")
      }
      for (const change of properties) {
        if (!change.key) {
          throw new Error("Each change must have a 'key' property")
        }
        if (
          !change.delete &&
          (change.value === undefined || change.value === null)
        ) {
          throw new Error(
            `Change for key '${change.key}' must have a 'value' or 'delete: true'`
          )
        }
      }
    } else {
      const key = core.getInput('key', {required: false})
      const value = core.getInput('value', {required: false})
      const type = core.getInput('type', {required: false}) || undefined
      const isDelete = core.getBooleanInput('delete', {required: false})

      if (!key) {
        throw new Error("Either 'key' or 'changes' input is required")
      }
      if (!isDelete && !value) {
        throw new Error("'value' input is required when not deleting")
      }

      properties = [
        {
          key,
          value: isDelete ? undefined : value,
          type: type as ModifyProperty['type'],
          delete: isDelete || undefined
        }
      ]
    }

    const {results, modified} = await modifyJsonFile(filePath, properties, {
      dryRun: isDryRun
    })

    core.setOutput('modified', String(modified))

    if (results.length === 1) {
      const old = results[0].oldValue
      let oldStr = ''
      if (old !== undefined) {
        oldStr =
          typeof old === 'object' && old !== null
            ? JSON.stringify(old)
            : String(old)
      }
      core.setOutput('old-value', oldStr)
    } else if (results.length > 1) {
      const oldValues: Record<string, unknown> = {}
      for (const r of results) {
        oldValues[r.key] = r.oldValue
      }
      core.setOutput('old-value', JSON.stringify(oldValues))
    }

    if (isCommit && !isDryRun) {
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

      const commitMessage =
        properties.length === 1
          ? `chore: update ${filePath} with ${properties[0].delete ? 'delete ' : ''}${properties[0].key}${properties[0].value !== undefined ? `=${properties[0].value}` : ''}`
          : `chore: update ${filePath} with ${properties.length} changes`

      await exec.exec('git', [
        'commit',
        '-am',
        commitMessage,
        '--no-verify'
      ])
      await exec.exec('git', [
        'push',
        '-u',
        'origin',
        `HEAD:${process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF}`
      ])
      core.info('File has been successfully committed and pushed')
    } else if (!isCommit) {
      core.info('Skipping commit files')
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    core.setFailed(message)
  }
}
