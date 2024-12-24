// @ts-check

import { readFileSync } from 'fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as tsjest from 'ts-jest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MONOREPO_ROOT = resolve(__dirname, '../..')
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
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testEnvironment: 'node',
  testTimeout: 20000,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    ...(paths
      ? pathsToModuleNameMapper(paths, {
          prefix: MONOREPO_ROOT,
          useESM: true,
        })
      : {}),
  },
}
