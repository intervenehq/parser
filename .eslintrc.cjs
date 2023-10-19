/* eslint-env node */
/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  ignorePatterns: ['.eslintrc.cjs'],
  root: true,
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
