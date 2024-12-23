// @ts-check

// import tseslint from '@typescript-eslint/eslint-plugin'
import eslint from '@eslint/js'
import * as tseslintParser from '@typescript-eslint/parser'
import tsdocPlugin from 'eslint-plugin-tsdoc'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import tseslint2 from '@typescript-eslint/eslint-plugin'
// import prettierPlugin from 'prettier-eslint'

export default tseslint.config({
  files: ['**/*.ts'],
  extends: [
    eslint.configs.recommended,
    tseslint.configs.recommended,
    // tseslint.configs.recommendedTypeChecked,
    eslintPluginPrettierRecommended,
  ],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  ignores: ['**/lib/**', '**/dist/**', 'node_modules/**', '**/*.d.ts', '.rollup.cache/**'],
  // Remove languageOptions for now since it's causing issues
  rules: {
    // ESLint core rules
    'no-constant-condition': 'off',
    quotes: 'off',
    semi: ['error', 'never'],

    // TypeScript rules
    '@typescript-eslint/no-redundant-type-constituents': 'off',
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',

    // '@typescript-eslint/await-thenable': 'error',
    // '@typescript-eslint/no-floating-promises': 'error',
    // '@typescript-eslint/no-misused-promises': 'error',

    // Node plugin rules
    'node/no-missing-import': 'off',
    'node/no-empty-function': 'off',
    'node/no-unsupported-features/es-syntax': 'off',
    'node/no-missing-require': 'off',
    'node/shebang': 'off',
    'node/no-extraneous-import': 'off',
    'node/no-extraneous-require': 'off',
    'node/no-unpublished-import': 'off',

    // Other plugin rules
    'tsdoc/syntax': 'off',
    'prettier/prettier': 'warn',
  },
})

// export default [
//   eslint.configs.recommended,
//   tseslint2.configs.recommended,
//   eslintPluginPrettierRecommended,
//   {
//     ignores: [
//       'examples/**/*',
//       '/node_modules/*',
//       '**/node_modules',
//       '**/dist',
//       '/**/dist/*',
//       '**/*.d.ts',
//       'types/*',
//       '**/.rollup.cache/*',
//       'lib/',
//     ],
//   },
//   {
//     files: ['**/*.{js,mjs,cjs,ts,tsx}'],
//     plugins: {
//       '@typescript-eslint': tseslint,
//       // prettier: prettierPlugin,
//       tsdoc: tsdocPlugin,
//     },
//     languageOptions: {
//       parser: tseslintParser,
//       parserOptions: {
//         ecmaVersion: 'latest',
//         sourceType: 'module',
//         projectService: {
//           rootDir: import.meta.dirname,
//           project: ['./tsconfig.json', './packages/*/tsconfig.json'],
//         },
//         tsconfigRootDir: import.meta.dirname,
//       },
//       globals: {
//         ...globals.browser,
//         ...globals.node,
//         NodeJS: true,
//       },
//     },
//     settings: {
//       'import/resolver': {
//         typescript: {},
//       },
//     },
//     rules: {
//       ...eslint.configs.recommended.rules,
//       ...tseslint.configs['recommended'].rules,

//       // ESLint core rules
//       'no-constant-condition': 'off',
//       quotes: 'off',
//       semi: ['error', 'never'],

//       // TypeScript rules
//       '@typescript-eslint/no-redundant-type-constituents': 'off',
//       '@typescript-eslint/no-use-before-define': 'off',
//       '@typescript-eslint/no-unsafe-assignment': 'off',
//       '@typescript-eslint/no-var-requires': 'off',
//       '@typescript-eslint/ban-ts-comment': 'off',
//       '@typescript-eslint/no-explicit-any': 'off',
//       '@typescript-eslint/require-await': 'error',
//       '@typescript-eslint/no-floating-promises': 'error',
//       '@typescript-eslint/unbound-method': 'warn',

//       // Node plugin rules
//       'node/no-missing-import': 'off',
//       'node/no-empty-function': 'off',
//       'node/no-unsupported-features/es-syntax': 'off',
//       'node/no-missing-require': 'off',
//       'node/shebang': 'off',
//       'node/no-extraneous-import': 'off',
//       'node/no-extraneous-require': 'off',
//       'node/no-unpublished-import': 'off',

//       // Other plugin rules
//       'tsdoc/syntax': 'off',
//       'prettier/prettier': 'warn',
//     },
//   },
//   // prettier, // Apply prettier config last
// ]
