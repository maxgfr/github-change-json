module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: {
          esModuleInterop: true,
          strict: true,
          noImplicitAny: true,
          module: 'commonjs',
          target: 'es6',
          types: ['node', 'jest']
        }
      }
    ]
  },
  verbose: true,
  testEnvironment: 'node'
}