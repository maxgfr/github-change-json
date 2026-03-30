# github-change-json

[![View Action](https://img.shields.io/badge/view-github%20action-yellow.svg)](https://github.com/marketplace/actions/github-change-json) [![Tests](https://img.shields.io/badge/tests-165%20passing-brightgreen)](https://github.com/maxgfr/github-change-json/actions/workflows/test-build.yml) [![Integration](https://img.shields.io/badge/integration-16%20jobs-blue)](https://github.com/maxgfr/github-change-json/actions/workflows/test-action.yml)

A [GitHub Action](https://github.com/features/actions) to modify values in JSON and JSONC files during workflows. Supports nested keys, typed values, deep merge, array indices, schema validation, and more.

## Why

Sometimes you need to update a `.json` file during a CI/CD workflow:

- Publish the same package to GitHub Packages (`@myorg/pkg`) and npm (`pkg`) with different names
- Bump a version number during a release
- Update a `tsconfig.json` compiler option before deployment
- Set the `homepage` field for GitHub Pages

This action handles all of these by modifying your JSON file in-place, preserving formatting and comments.

## Quick Start

```yaml
- uses: maxgfr/github-change-json@main
  with:
    key: 'version'
    value: '2.0.0'
    path: package.json
```

## Examples

### Nested Keys (dot notation)

```yaml
- uses: maxgfr/github-change-json@main
  with:
    key: 'compilerOptions.target'
    value: 'ES2020'
    path: tsconfig.json
```

Works with JSONC files (e.g. `tsconfig.json` with comments) -- comments are preserved.

### Typed Values

By default values are strings. Use `type` for numbers, booleans, or JSON objects:

```yaml
- uses: maxgfr/github-change-json@main
  with:
    key: 'port'
    value: '3000'
    type: 'number'    # stored as 3000, not "3000"
    path: config.json

- uses: maxgfr/github-change-json@main
  with:
    key: 'compilerOptions.strict'
    value: 'true'
    type: 'boolean'   # stored as true, not "true"
    path: tsconfig.json

- uses: maxgfr/github-change-json@main
  with:
    key: 'scripts'
    value: '{"build": "tsc", "test": "jest"}'
    type: 'json'      # stored as an object, not a string
    path: package.json
```

### Array Indices

Numeric path segments are treated as array indices:

```yaml
- uses: maxgfr/github-change-json@main
  with:
    key: 'contributors.0.name'    # first element of the array
    value: 'Alicia'
    path: package.json
```

### Deep Merge

Merge new keys into an existing object without overwriting untouched keys:

```yaml
- uses: maxgfr/github-change-json@main
  with:
    key: 'scripts'
    value: '{"start": "node .", "deploy": "fly deploy"}'
    merge: true
    path: package.json
# {"build":"tsc","test":"jest"} + merge → {"build":"tsc","test":"jest","start":"node .","deploy":"fly deploy"}
```

Nested objects are recursively merged; arrays and primitives are replaced.

### Delete a Key

```yaml
- uses: maxgfr/github-change-json@main
  with:
    key: 'devDependencies'
    path: package.json
    delete: true
```

### Multiple Changes at Once

```yaml
- uses: maxgfr/github-change-json@main
  with:
    path: package.json
    changes: |
      [
        {"key": "name", "value": "@my-org/my-package"},
        {"key": "version", "value": "2.0.0"},
        {"key": "private", "value": "true", "type": "boolean"},
        {"key": "scripts", "value": "{\"deploy\": \"fly deploy\"}", "merge": true},
        {"key": "devDependencies", "delete": true}
      ]
```

### Schema Validation

Validate the result against a JSON Schema **before** writing. If validation fails, the file is not modified:

```yaml
- uses: maxgfr/github-change-json@main
  with:
    key: 'version'
    value: '2.0.0'
    path: package.json
    schema: schemas/package.schema.json    # local file path
    # or: schema: 'https://json.schemastore.org/package.json'
```

### Create File if Missing

Create the target file with `{}` if it doesn't exist yet (parent directories are created automatically):

```yaml
- uses: maxgfr/github-change-json@main
  with:
    key: 'database.host'
    value: 'localhost'
    path: config/settings.json
    create-if-missing: true
```

### Dry Run

Preview what would change without modifying the file:

```yaml
- uses: maxgfr/github-change-json@main
  with:
    key: 'name'
    value: '@my-org/my-package'
    path: package.json
    dry-run: true
```

### Commit and Push

```yaml
- uses: maxgfr/github-change-json@main
  with:
    key: 'name'
    value: '@my-org/my-package'
    path: package.json
    commit: true
```

### Use Outputs

```yaml
- id: update
  uses: maxgfr/github-change-json@main
  with:
    key: 'version'
    value: '2.0.0'
    path: package.json

- run: |
    echo "Old: ${{ steps.update.outputs.old-value }}"
    echo "New: ${{ steps.update.outputs.new-value }}"

- if: steps.update.outputs.modified == 'true'
  run: echo "File changed, deploying..."
```

## Inputs

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `path` | string | **yes** | -- | Path to the JSON file (relative to repo root) |
| `key` | string | no\* | -- | Key to modify. Supports dot notation for nesting (`a.b.c`) and array indices (`items.0.name`). Escape literal dots with `\\` (`my\\.key`) |
| `value` | string | no\* | -- | Value to set (always passed as a string, converted via `type`) |
| `type` | string | no | `string` | Value type: `string`, `number`, `boolean`, or `json` |
| `commit` | boolean | no | `false` | Commit and push changes |
| `delete` | boolean | no | `false` | Delete the key instead of setting a value |
| `merge` | boolean | no | `false` | Deep merge a JSON object into the existing value |
| `dry-run` | boolean | no | `false` | Preview changes without writing to disk |
| `create-if-missing` | boolean | no | `false` | Create the file with `{}` if it doesn't exist |
| `changes` | string | no | -- | JSON array of changes (overrides single-key inputs). Each item: `{"key", "value", "type", "delete", "merge"}` |
| `schema` | string | no | -- | Path or URL to a JSON Schema to validate the result against |

\*Either `key` or `changes` is required. `value` is required unless `delete: true`.

## Outputs

| Name | Description |
|------|-------------|
| `old-value` | Previous value (string for single key, JSON object for multiple keys) |
| `new-value` | New value after modification (same format as `old-value`) |
| `modified` | `'true'` if the file content changed, `'false'` otherwise |

## Behavior Details

### JSONC Support

Files with line comments (`//`), block comments (`/* */`), and trailing commas are fully supported. Comments are preserved when modifying values.

### Formatting Preservation

The action detects and preserves the original file's:
- **Indentation** (2 spaces, 4 spaces, tabs)
- **Line endings** (LF, CRLF)
- **Trailing newline**

### Schema Validation

- Runs **before** writing -- the file is never left in an invalid state
- Works in `dry-run` mode too (validates the would-be result)
- Supports local file paths and `http://` / `https://` URLs (30s fetch timeout)
- Uses JSON Schema draft-07 via [Ajv](https://ajv.js.org/)
- `$ref` to external URLs within the schema is not supported

### Commit Behavior

When `commit: true`:
- Git user is set to `GITHUB_ACTOR` (or `github-actions[bot]`)
- Commit message: `chore: update <path> (set <key>=<value>)` (values are truncated if long)
- Pushed to the triggering branch
- Skipped in `dry-run` mode

### Error Handling

The action fails with a clear message when:
- File not found (and `create-if-missing` is `false`)
- Invalid JSON/JSONC syntax
- Invalid type conversion (`type: number` with `value: abc`)
- Invalid `type` value (`integer`, `float`, etc.)
- Conflicting flags (`delete` + `merge`)
- Non-string `value` in `changes` array
- Schema validation failure
- Setting a nested path through a primitive (`name.sub` when `name` is a string)

### Limitations

- String key modifications require an object root (`{}`), not an array root (`[]`)
- Purely numeric path segments are always array indices -- string keys like `"0"` are not supported
- Merge requires a JSON object value (not arrays or primitives)
- Schema `$ref` to external URLs is not resolved

## Development

```bash
pnpm install          # install dependencies
pnpm run build        # compile TypeScript
pnpm run package      # bundle with ncc
pnpm run lint         # run ESLint
pnpm run format       # format with Prettier
pnpm test             # run 165 tests
pnpm run all          # build + package + lint + test
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
