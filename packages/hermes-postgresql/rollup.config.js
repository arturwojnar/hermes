// @ts-check

import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import resolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

/** @type {import('rollup').RollupOptions[]} */
const options = [
  {
    input: 'src/index.ts', // Entry point for your library
    output: [
      {
        file: 'lib/index.cjs', // Output file for CommonJS
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: 'lib/index.mjs', // Output file for ESM with .mjs extension
        format: 'es',
        sourcemap: true,
      },
    ],
    plugins: [
      json(),
      typescript({
        tsconfig: './tsconfig.build.json',
        outputToFilesystem: false,
        noEmitOnError: true, // Fail build on TS errors
        sourceMap: true,
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
      }),
      resolve(),
      commonjs(),
    ],
    external: ['@arturwojnar/hermes', 'postgres'],
    onwarn(warning, warn) {
      // Fail on TS errors
      if (warning.code === 'PLUGIN_WARNING' && warning.plugin === 'typescript') {
        throw new Error(warning.message)
      }

      // Check for circular dependencies
      if (warning.code === 'CIRCULAR_DEPENDENCY' && /node_modules/.test(warning.message)) {
        // Ignore circular dependencies of modules in node_modules
        return
      }

      // For all other warnings, print them to the console
      warn(warning)
    },
  },
]

export default options
