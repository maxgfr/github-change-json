# github-change-json [![View Action](https://img.shields.io/badge/view-github%20action-yellow.svg)](https://github.com/marketplace/actions/github-change-json) [![pipeline](https://img.shields.io/github/workflow/status/maxgfr/github-change-json/build-test)](https://github.com/maxgfr/github-change-json/actions/workflows/test-build.yml) [![Tests](https://img.shields.io/badge/tests-32%20passing-brightgreen)](https://github.com/maxgfr/github-change-json/actions/workflows/test-build.yml)

`maxgfr/github-change-json` is a [GitHub Action](https://github.com/features/actions) which lets you change a value from a JSON file (e.g. `package.json`, `tsconfig.json`, or any other JSON file).

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

#### 3. Modify TypeScript Configuration

```yaml
- name: Update TypeScript target
  uses: maxgfr/github-change-json@main
  with:
    key: 'compilerOptions.target'
    value: 'ES2020'
    path: tsconfig.json
```

## Inputs

**Name**|**Type**|**Required**|**Description**
-----|-----|-----|-----
path|string|yes|Path to the JSON file you want to update (relative to repository root)
key|string|yes|Key that you want to modify in your JSON
value|string|yes|Value linked to the key that you want to modify in your JSON
commit|boolean|no|Boolean flag to commit and push the changes to the repository (default: false)

## Output

This action does not produce any outputs. It modifies the specified JSON file and optionally commits the changes.

## Behavior

### File Modification

The action will:
1. Read the JSON file at the specified path
2. Update the specified key with the new value
3. Write the modified JSON back to the file with proper formatting (2-space indentation)

### Error Handling

The action will fail and provide clear error messages if:
- The specified file does not exist
- The file contains invalid JSON
- The file cannot be read or written

### Commit Behavior

When `commit: true`:
- The action will configure git with the GitHub Actions bot credentials
- Changes will be committed with message: `chore: update <path> with <key>=<value>`
- The commit will be pushed to the branch that triggered the workflow
- Pre-commit hooks are bypassed with `--no-verify`

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
