module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'ts'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: false }]
  },
  verbose: true,
  testEnvironment: 'node',
  preset: 'ts-jest'
}
