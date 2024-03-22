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
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {},
  // transform: {
  //   // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
  //   // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
  //   '^.+\\.m?[tj]sx?$': [
  //     'ts-jest',
  //     {
  //       useESM: true,
  //     },
  //   ],
  // },
  testMatch: ['**/test/*.test.ts'],
  testEnvironment: 'node',
  testTimeout: 20000,
  moduleNameMapper: {
    ...pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>' }),
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  modulePaths: ['<rootDir>'],
  collectCoverage: true,
  // clearMocks: true,
  coverageDirectory: 'coverage',
  // globals: {
  //   'ts-jest': {
  //     tsConfig: 'tsconfig.json',
  //   },
  // },
  // transform: {
  //   '^.+\\.{ts|tsx}?$': [
  //     'ts-jest',
  //     {
  //       babel: true,
  //       tsConfig: 'tsconfig.jest.json',
  //     },
  //   ],
  // },
  // moduleFileExtensions: ['ts', 'js', 'json'],
  // // testMatch: ['**/?(*.)+(e2e.)(spec|test).ts', 'test/e2e/*.test.(ts)'],
  // testMatch: ['**/test/*.test.ts'],
  // testEnvironment: 'node',
  // testTimeout: 20000,
  // moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>' }),
  // modulePaths: ['<rootDir>'],
  // collectCoverage: true,
  // // clearMocks: true,
  // coverageDirectory: 'coverage',
}
