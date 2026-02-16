module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest'
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off'
  },
  overrides: [
    {
      files: ['src/web/**/*.js', 'public/js/**/*.js'],
      env: {
        browser: true,
        node: false
      }
    }
  ],
  ignorePatterns: ['node_modules/', 'logs/', 'public/images/']
};
