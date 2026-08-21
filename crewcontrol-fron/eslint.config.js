// Phase 12 finding: this file was missing entirely, even though every
// ESLint-related devDependency it needs (@eslint/js, eslint-plugin-react-hooks,
// eslint-plugin-react-refresh) is already declared in package.json, and
// package.json's own "main" field still points at "eslint.config.js" - all
// clear evidence this is the standard Vite+React scaffold config that was
// either deleted or never committed, not a deliberate absence. `npm run lint`
// was completely non-functional before this fix (ESLint 9 requires this flat
// config format and refuses to run without it). Restored to the standard
// Vite React template config matching the exact plugin set already present -
// this is not a new opinionated style choice, it's what these dependencies
// were installed to be used with.
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default [
  { ignores: ['dist'] },
  {
    // vite.config.js itself runs in Vite's Node-context config loader, not
    // the browser - it legitimately uses __dirname (confirmed: `npm run
    // build` succeeds and resolves the @mui/icons-material alias
    // correctly). Scoping it separately with node globals avoids a false
    // "'__dirname' is not defined" report from the browser-globals rule
    // below, which is this config's own scoping gap, not a bug in
    // vite.config.js.
    files: ['vite.config.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['vite.config.js'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
]
