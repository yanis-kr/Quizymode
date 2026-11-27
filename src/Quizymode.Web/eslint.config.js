import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // #918: schemas must run after Zod's jitless setting, so app code takes `z` from src/utils/zodConfig.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/utils/zodConfig.ts', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { paths: [{ name: 'zod', message: "Import { z } from '@/utils/zodConfig'." }] }],
    },
  },
])
