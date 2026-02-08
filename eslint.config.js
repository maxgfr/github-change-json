const tseslint = require('typescript-eslint')

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'lib/**',
      '**/*.test.ts',
      '.husky/**'
    ]
  },
  ...tseslint.configs.recommended
]
