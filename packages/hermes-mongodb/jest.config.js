const { pathsToModuleNameMapper } = require('ts-jest')
const { compilerOptions } = require('./tsconfig')
module.exports = {
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  // testMatch: ['**/?(*.)+(e2e.)(spec|test).ts', 'test/e2e/*.test.(ts)'],
  testMatch: ['**/test/*.test.ts'],
  testEnvironment: 'node',
  testTimeout: 20000,
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>' }),
  modulePaths: ['<rootDir>'],
}
