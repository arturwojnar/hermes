import typescript from '@rollup/plugin-typescript'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'

export default [
  {
    input: 'src/index.ts', // Entry point for your library
    output: [
      {
        file: 'lib/index.cjs.js', // Output file for CommonJS
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: 'lib/index.esm.js', // Output file for ESM
        format: 'es',
        sourcemap: true,
      },
    ],
    plugins: [
      json(),
      typescript({ tsconfig: './tsconfig.build.json', outputToFilesystem: false }),
      resolve(),
      commonjs(),
    ],
    onwarn(warning, warn) {
      // Check the warning code
      if (warning.code === 'CIRCULAR_DEPENDENCY' && /node_modules/.test(warning.message)) {
        // Ignore circular dependencies of modules in node_modules
        return
      }
      // For all other warnings, print them to the console
      warn(warning)
    },
  },
]
