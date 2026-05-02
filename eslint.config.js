const nextConfig = require('eslint-config-next');
const prettierConfig = require('eslint-config-prettier');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...nextConfig,
  prettierConfig,
  {
    rules: {
      // React Compiler rules — downgraded to warn (false positives on existing code)
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      // Pre-existing style issue — warn rather than block
      'react/no-unescaped-entities': 'warn',
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'supabase/functions/**'],
  },
];
