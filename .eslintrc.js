module.exports = {
  root: true,
  env: {
    browser: true,
    node: true
  },
  extends: ['standard', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    },
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint'],
  rules: {}
}
