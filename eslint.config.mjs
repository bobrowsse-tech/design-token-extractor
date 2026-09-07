// Flat config is the only format ESLint 9+ supports by default (v9 reached
// EOL 2026-08-06; this targets the current v10 line). Using the
// `typescript-eslint` package (not the older separate @typescript-eslint/*
// parser+plugin combo) for its typed `tseslint.config()` helper.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/out/**', '**/node_modules/**', '**/*.vsix', '**/demo/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      // Deliberately not enabling type-aware linting (parserOptions.project)
      // workspace-wide — it's significantly slower and this project doesn't
      // yet need it. Revisit if a rule that requires type info becomes
      // necessary.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  }
);
