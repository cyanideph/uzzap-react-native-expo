/**
 * ESLint config — Expo + TypeScript + Prettier.
 * @type {import('eslint').Linter.Config}
 */
module.exports = {
  root: true,
  extends: ['expo', 'prettier', 'plugin:drizzle/recommended'],
  plugins: ['drizzle'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
      typescript: {
        project: './tsconfig.json',
      },
    },
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'web-build/',
    'android/',
    'ios/',
    '.expo/',
    'drizzle/migrations/',
    '*.config.js',
    'babel.config.js',
    'metro.config.js',
    '.eslintrc.js',
  ],
  rules: {
    'prettier/prettier': 'off',
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': [
      'warn',
      { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
    ],
    'react-hooks/exhaustive-deps': 'warn',
    'react/no-unescaped-entities': 'off',
    // Drizzle: require `where` on update/delete. Scope to real Drizzle
    // clients so `Map`/`Set`/MMKV `.delete()` calls are not false positives.
    'drizzle/enforce-delete-with-where': ['error', { drizzleObjectName: ['db', 'tx'] }],
    'drizzle/enforce-update-with-where': ['error', { drizzleObjectName: ['db', 'tx'] }],
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        'no-undef': 'off',
      },
    },
    {
      files: ['app/**/*.tsx', 'src/components/**/*.tsx'],
      rules: {
        // Screens/components intentionally export route config defaults.
        'import/no-default-export': 'off',
      },
    },
  ],
};
