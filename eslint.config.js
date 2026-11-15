//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      // False positives on record lookups without `noUncheckedIndexedAccess`.
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      '.output/**',
      'dist/**',
      '.nitro/**',
      '.tanstack/**',
      '.wrangler/**',
      'test-results/**',
      'src/routeTree.gen.ts',
      'src/sw.js',
    ],
  },
]
