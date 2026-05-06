import js from '@eslint/js';
import globals from 'globals';
import parser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import';

const MAX_CORE_FILE_LINES = 500;

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/js/**',
      'coverage/**',
      'tests/engine_v2.test.js',
    ],
  },
  js.configs.recommended,
  {
    files: [
      'scripts/**/*.mjs',
      '*.config.ts',
      '*.config.js',
      'playwright.config.ts',
      'vitest.config.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-undef': 'off',
      'import/no-default-export': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'import/no-cycle': 'error',
      'import/no-mutable-exports': 'error',
      'import/no-default-export': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
        },
      ],
      'max-lines': [
        'error',
        {
          max: MAX_CORE_FILE_LINES,
          skipBlankLines: true,
          skipComments: true,
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: true,
      },
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: ['../ui/*', '../app/*'],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '../core/engine',
            '../core/schedule',
            '../core/relations',
            '../core/difficulty',
          ],
        },
      ],
    },
  },
  {
    files: ['playwright.config.ts', 'vitest.config.ts'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
  {
    files: ['src/svelte.d.ts'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
];
