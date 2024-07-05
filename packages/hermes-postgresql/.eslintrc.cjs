// @ts-check

/**
 * @type {import('eslint').ESLint.ConfigData}
 */
module.exports = {
  extends: '../../.eslintrc.cjs',
  ignorePatterns: ['lib/'],
  parserOptions: {
    project: ['./tsconfig.json'],
  },
}
