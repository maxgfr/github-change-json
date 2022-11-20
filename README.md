# github-change-json [![View Action](https://img.shields.io/badge/view-github%20action-yellow.svg)](https://github.com/marketplace/actions/github-change-json) [![pipeline](https://img.shields.io/github/workflow/status/maxgfr/github-change-json/build-test)](https://github.com/maxgfr/github-change-json/actions/workflows/test-build.yml)

`maxgfr/github-change-json` is a [GitHub Action](https://github.com/features/actions) which lets you to change a value from a json file (e.g. package.json).

## Why

Sometimes you need to update a `.json` file in your project during a workflow. For example, when you want to deploy a package to github packages and npm packages with a different name for each package. (e.g. `@maxgfr/package-name` for github packages and `package-name` for npm packages) or you want to publish a create-react-app to github pages by modifing `homepage` prop such as [here](https://github.com/maxgfr/release-notes-finder/blob/main/.github/workflows/pages.yml#L27-L32). The purpose of this action is to handle this kind of situation by updating your `.json` file directly during the workflow without having to manually edit it.

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

## Inputs

**Name**|**Type**|**Required**|**Description**
-----|-----|-----|-----
path|string|yes|Path of the *.json that you want to update.
key|string|yes|Key of the property that you want to update.
value|string|yes|Value of the property that you want to update.
commit|boolean|no|Boolean flag that indicate if you need to commit or not the change.
