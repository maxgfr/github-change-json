# github-change-json

[![View Action](https://img.shields.io/badge/view-github%20action-yellow.svg)](https://github.com/marketplace/actions/github-change-json) [![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](https://github.com/maxgfr/github-change-json/actions/workflows/test-build.yml)

`maxgfr/github-change-json` is a [GitHub Action](https://github.com/features/actions) which lets you change values in a JSON or JSONC file (e.g. `package.json`, `tsconfig.json`, or any other JSON file).

## Why

Sometimes you need to update a `.json` file in your project during a workflow. For example, when you want to deploy a package to GitHub Packages and npm packages with a different name for each package (e.g. `@maxgfr/package-name` for GitHub Packages and `package-name` for npm packages) or you want to publish a create-react-app to GitHub Pages by modifying the `homepage` prop such as [here](https://github.com/maxgfr/release-notes-finder/blob/main/.github/workflows/pages.yml#L27-L32). The purpose of this action is to handle this kind of situation by updating your `.json` file directly during the workflow without having to manually edit it.

## Usage

### Basic Example

```yaml
name: 'action-test'
on:
  pull_request:
  push:

jobs:
  action:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Get commit sha
        run: |
          echo "GITHUB_SHA=${GITHUB_SHA}" >> $GITHUB_ENV
      - name: Modify name of the package.json
        uses: maxgfr/github-change-json@main
        with:
          key: 'name'
          value: '@maxgfr/example-${{ env.GITHUB_SHA }}'
          path: example/package.json
          commit: true # it will commit the change
      - name: Modify name of the package.json locally
        uses: maxgfr/github-change-json@main
        with:
          key: 'name'
          value: 'yo'
          path: ./example/package.json
```

### Use Cases

#### 1. Scoped Package Names for Different Registries

```yaml
- name: Update package name for GitHub Packages
  uses: maxgfr/github-change-json@main
  with:
    key: 'name'
    value: '@my-org/my-package'
    path: package.json
    commit: false
```

#### 2. Update Version Number

```yaml
- name: Bump version
  uses: maxgfr/github-change-json@main
  with:
    key: 'version'
    value: '2.0.0'
    path: package.json
    commit: true
```

#### 3. Modify Nested TypeScript Configuration

Dot notation is supported for nested keys:

```yaml
- name: Update TypeScript target
  uses: maxgfr/github-change-json@main
  with:
    key: 'compilerOptions.target'
    value: 'ES2020'
    path: tsconfig.json
```

This also works with JSONC files (tsconfig.json with comments) - comments are preserved.

#### 4. Set Typed Values

By default, values are stored as strings. Use the `type` input to set numbers, booleans, or JSON objects:

```yaml
- name: Set port as a number
  uses: maxgfr/github-change-json@main
  with:
    key: 'port'
    value: '3000'
    type: 'number'
    path: config.json

- name: Enable a flag as boolean
  uses: maxgfr/github-change-json@main
  with:
    key: 'compilerOptions.strict'
    value: 'true'
    type: 'boolean'
    path: tsconfig.json

- name: Set a JSON object
  uses: maxgfr/github-change-json@main
  with:
    key: 'scripts'
    value: '{"build": "tsc", "test": "jest"}'
    type: 'json'
    path: package.json
```

#### 5. Delete a Key

```yaml
- name: Remove devDependencies before publish
  uses: maxgfr/github-change-json@main
  with:
    key: 'devDependencies'
    path: package.json
    delete: true
    commit: true
```

#### 6. Multiple Changes in a Single Step

Use the `changes` input to apply multiple modifications at once:

```yaml
- name: Update multiple fields
  uses: maxgfr/github-change-json@main
  with:
    path: package.json
    changes: |
      [
        {"key": "name", "value": "@my-org/my-package"},
        {"key": "version", "value": "2.0.0"},
        {"key": "private", "value": "false", "type": "boolean"},
        {"key": "devDependencies", "delete": true}
      ]
    commit: true
```

#### 7. Dry Run (Preview Changes)

```yaml
- name: Preview changes without modifying
  uses: maxgfr/github-change-json@main
  with:
    key: 'name'
    value: '@my-org/my-package'
    path: package.json
    dry-run: true
```

#### 8. Use Previous Value and Check if Modified

```yaml
- name: Update name
  id: update
  uses: maxgfr/github-change-json@main
  with:
    key: 'name'
    value: '@my-org/my-package'
    path: package.json

- name: Show previous value
  run: echo "Previous name was ${{ steps.update.outputs.old-value }}"

- name: Conditional step based on changes
  if: steps.update.outputs.modified == 'true'
  run: echo "File was modified, running deploy..."
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `path` | string | yes | - | Path to the JSON file you want to update (relative to repository root) |
| `key` | string | no* | - | Key to modify (supports dot notation for nested keys, e.g. `compilerOptions.target`) |
| `value` | string | no* | - | Value to set for the key |
| `type` | string | no | `string` | Type of the value: `string`, `number`, `boolean`, or `json` |
| `commit` | boolean | no | `false` | Commit and push the changes to the repository |
| `delete` | boolean | no | `false` | Delete the specified key instead of setting a value |
| `dry-run` | boolean | no | `false` | Preview changes without modifying the file |
| `changes` | string | no | - | JSON array of changes to apply (overrides `key`/`value`/`type`/`delete`) |

*Either `key` or `changes` is required. When using `key` without `delete: true`, `value` is also required.

## Outputs

| Name | Description |
|------|-------------|
| `old-value` | The previous value of the modified key. For single key: the value as a string. For multiple keys: a JSON object mapping keys to old values. |
| `modified` | Whether the file content was actually changed (`'true'` or `'false'`). Useful for conditional steps. |

## Behavior

### Nested Keys

Use dot notation to access nested keys: `compilerOptions.target` modifies `{ "compilerOptions": { "target": ... } }`. Intermediate objects are created automatically if they don't exist.

To use a literal dot in a key name, escape it with a backslash: `my\\.dotted\\.key`.

### JSONC Support

The action supports JSONC (JSON with Comments) files like `tsconfig.json`. Line comments (`//`) and block comments (`/* */`) are preserved when modifying values.

### Formatting Preservation

The action detects and preserves:
- Indentation style (2 spaces, 4 spaces, tabs)
- Line endings (LF, CRLF)
- Trailing newlines

### Type Validation

The `type` input only accepts: `string` (default), `number`, `boolean`, or `json`. Any other value will cause the action to fail with a clear error message.

### Limitations

- The root of the JSON file must be an object (`{}`), not an array (`[]`).
- You cannot set a nested path through an existing primitive value (e.g., setting `name.sub` when `name` is a string). Delete the key first, then set the nested path.
- All values are passed as strings and converted based on the `type` input.

### Error Handling

The action will fail and provide clear error messages if:
- The specified file does not exist
- The file contains invalid JSON/JSONC
- The file cannot be read or written
- An invalid type conversion is requested (e.g. `type: number` with `value: abc`)

### Commit Behavior

When `commit: true`:
- The action will configure git with the GitHub Actions bot credentials
- Changes will be committed with message: `chore: update <path> with <key>=<value>`
- The commit will be pushed to the branch that triggered the workflow
- Pre-commit hooks are bypassed with `--no-verify`
- Commits are skipped in `dry-run` mode

## Development

### Install

```bash
pnpm install
```

### Build

```bash
pnpm run build
```

### Test

```bash
pnpm test
```

### Lint

```bash
pnpm run lint
```

### Format

```bash
pnpm run format
```

### All Checks

```bash
pnpm run all
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
