// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Scripts do Node (build do site, apps e publicação automática)
    files: ['scripts/**/*.js'],
    languageOptions: { globals: { __dirname: 'readonly', Buffer: 'readonly', process: 'readonly', require: 'readonly', module: 'writable' } },
  },
]);
