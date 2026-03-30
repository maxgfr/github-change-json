import * as core from '@actions/core'
import * as exec from '@actions/exec'
import {modifyJsonFile, type ModifyProperty} from './utils'

function truncateValue(value: string, max: number): string {
  if (value.length <= max) return value
  return value.substring(0, max) + '...'
}

function serializeOutput(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

export const run = async (): Promise<void> => {
  try {
    core.info('Setting input and environment variables')
    const isCommit = core.getBooleanInput('commit', {required: false})
    const isDryRun = core.getBooleanInput('dry-run', {required: false})
    const createIfMissing = core.getBooleanInput('create-if-missing', {
      required: false
    })
    const filePath = core.getInput('path', {required: true})
    const changesInput = core.getInput('changes', {required: false})
    const schema = core.getInput('schema', {required: false}) || undefined

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
        if (!change.key || typeof change.key !== 'string') {
          throw new Error(
            "Each change must have a 'key' property (string)"
          )
        }
        if (change.delete && change.merge) {
          throw new Error(
            `Change for key '${change.key}': 'delete' and 'merge' cannot both be true`
          )
        }
        if (
          change.value !== undefined &&
          change.value !== null &&
          typeof change.value !== 'string'
        ) {
          throw new Error(
            `Change for key '${change.key}': 'value' must be a string, got ${typeof change.value}`
          )
        }
        if (change.merge && !change.value) {
          throw new Error(
            `Change for key '${change.key}' with merge requires a 'value'`
          )
        }
        if (
          !change.delete &&
          !change.merge &&
          (change.value === undefined || change.value === null)
        ) {
          throw new Error(
            `Change for key '${change.key}' must have a 'value', 'delete: true', or 'merge: true'`
          )
        }
      }
    } else {
      const key = core.getInput('key', {required: false})
      const value = core.getInput('value', {required: false})
      const type = core.getInput('type', {required: false}) || undefined
      const isDelete = core.getBooleanInput('delete', {required: false})
      const isMerge = core.getBooleanInput('merge', {required: false})

      if (!key) {
        throw new Error("Either 'key' or 'changes' input is required")
      }
      if (isDelete && isMerge) {
        throw new Error("'delete' and 'merge' cannot both be true")
      }
      if (!isDelete && !isMerge && !value) {
        throw new Error(
          "'value' input is required when not deleting or merging"
        )
      }
      if (isMerge && !value) {
        throw new Error("'value' input is required for merge")
      }

      properties = [
        {
          key,
          value: isDelete ? undefined : value,
          type: type as ModifyProperty['type'],
          delete: isDelete || undefined,
          merge: isMerge || undefined
        }
      ]
    }

    const {results, modified} = await modifyJsonFile(filePath, properties, {
      dryRun: isDryRun,
      schema,
      createIfMissing
    })

    core.setOutput('modified', String(modified))

    if (results.length === 1) {
      core.setOutput('old-value', serializeOutput(results[0].oldValue))
      core.setOutput('new-value', serializeOutput(results[0].newValue))
    } else if (results.length > 1) {
      const oldValues: Record<string, unknown> = {}
      const newValues: Record<string, unknown> = {}
      for (const r of results) {
        oldValues[r.key] = r.oldValue
        newValues[r.key] = r.newValue
      }
      core.setOutput('old-value', JSON.stringify(oldValues))
      core.setOutput('new-value', JSON.stringify(newValues))
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

      let commitMessage: string
      if (properties.length === 1) {
        const p = properties[0]
        const action = p.delete ? 'delete' : p.merge ? 'merge' : 'set'
        const valuePart =
          p.value !== undefined ? `=${truncateValue(p.value, 50)}` : ''
        commitMessage = `chore: update ${filePath} (${action} ${p.key}${valuePart})`
      } else {
        commitMessage = `chore: update ${filePath} with ${properties.length} changes`
      }

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
