module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    jest: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: [
    'dist/',
    'dist-electron/',
    'release/',
    'electron/native/build/',
    'electron/native/build-release/',
    'shared_cpp/build-test/',
    'shared_cpp/third_party/',
  ],
};
