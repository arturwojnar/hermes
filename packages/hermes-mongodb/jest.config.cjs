const { pathsToModuleNameMapper } = require('ts-jest')
const { compilerOptions } = require('./tsconfig.json')

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: 'tsconfig.jest.json',
    },
  },
  transform: {},
  testMatch: ['**/test/*.test.ts'],
  testEnvironment: 'node',
  testTimeout: 20000,
  moduleNameMapper: {
    ...pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>' }),
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  modulePaths: ['<rootDir>'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
}
