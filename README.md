# actions-change-json [![View Action](https://img.shields.io/badge/view-github%20action-yellow.svg)](https://github.com/marketplace/actions/actions-change-json) [![pipeline](https://img.shields.io/github/workflow/status/maxgfr/actions-change-json/build-test)](https://github.com/maxgfr/actions-change-jsons/actions/workflows/build.yaml)

`maxgfr/actions-change-json` is a [GitHub Action](https://github.com/features/actions) which lets you to change json values of a file (e.g. package.json).

## Why

Sometimes, you need to update a `.json` file in a package during an action, such as when you want to deploy a package across github and npm packages, and you want to have different version name for each package. (e.g `@maxgfr/package-name`for github and `package-name` for npm). That's why, I created this action.

## Usage

```yaml
name: 'action-test'
on:
  pull_request:
  push:

jobs:
  action:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Get commit sha
        run: |
          echo "GITHUB_SHA=${GITHUB_SHA}" >> $GITHUB_ENV
      - name: Modify name of the package.json
        uses: maxgfr/actions-change-json@main
        with:
          key: 'name'
          value: '@maxgfr/example-${{ env.GITHUB_SHA }}'
          path: example/package.json
          commit: true # it will commit the change
      - name: Modify name of the package.json locally
        uses: maxgfr/actions-change-json@main
        with:
          key: 'name'
          value: 'yo'
          path: ./example/package.json
```

## Inputs

**Name**|**Type**|**Required**|**Description**
-----|-----|-----|-----
path|string|yes|Path of the *.json that you want to update.
key|string|yes|Key of the property that you want to update.
value|string|yes|Value of the property that you want to update.
commit|boolean|no|Boolean flag that indicate if you need to commit or not the change.
