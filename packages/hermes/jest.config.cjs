/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: 'tsconfig.jest.json',
      },
    ],
  },
  testMatch: ['**/*/*.test.ts'],
  testEnvironment: 'node',
  testTimeout: 20000,
  collectCoverage: true,
  coverageDirectory: 'coverage',
}
