import { readFileSync } from 'fs'
import * as tsjest from 'ts-jest'

const { pathsToModuleNameMapper } = tsjest
const tsconfig = JSON.parse(readFileSync('./tsconfig.json', 'utf-8'))
const paths = tsconfig?.compilerOptions?.paths

/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: './tsconfig.jest.json',
      },
    ],
  },
  testMatch: ['**/*/*.test.ts', 'packages/hermes-postgresql/test/*.test.ts'],
  testEnvironment: 'node',
  testTimeout: 20000,
  moduleDirectories: ['node_modules', 'src'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    ...(paths
      ? pathsToModuleNameMapper(paths, {
          prefix: '<rootDir>',
          useESM: true,
        })
      : {}),
  },
  // modulePaths: ['<rootDir>'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
}
