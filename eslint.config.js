import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

export default [
  { ignores: ['node_modules/', 'test/fixtures/', '.superpowers/', '.impeccable/', '.claude/worktrees/', '_site/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },
  {
    files: ['public/**/*.js', 'site/site.js', 'site/demo/**/*.js'],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ['public/logic/**/*.js'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['document', 'window', 'localStorage', 'sessionStorage', 'location', 'history', 'navigator'].map((name) => ({
          name,
          message: 'public/logic/ is pure: move DOM code to public/ui/ or public/pages/.'
        }))
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/core/dom.js', '**/ui/*', '**/pages/*', '**/api.js', '**/app.js'],
              message: 'public/logic/ may import only core/format.js, core/state.js, core/icons.js, and logic/.'
            }
          ]
        }
      ]
    }
  },
  prettier
]
