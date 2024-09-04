// @ts-check

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['**/*/*.test.ts'],
  testEnvironment: 'node',
  testTimeout: 20000,
  transform: {
    '^.+\\.{ts|tsx}?$': [
      'ts-jest',
      {
        babel: true,
        tsConfig: 'tsconfig.json',
      },
    ],
  },
}
