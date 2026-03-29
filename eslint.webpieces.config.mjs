// @webpieces/dev-config ESLint Configuration
// Only includes @webpieces custom rules

import webpiecesPlugin from '@webpieces/dev-config/eslint-plugin';

export default [
    {
        ignores: ['**/dist', '**/node_modules', '**/coverage', '**/.nx', '**/generated'],
    },
    {
        files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
        plugins: {
            '@webpieces': webpiecesPlugin,
        },
        rules: {
            '@webpieces/catch-error-pattern': 'error',
            '@webpieces/no-unmanaged-exceptions': 'error',
            '@webpieces/max-method-lines': ['error', { max: 150 }],
            '@webpieces/max-file-lines': ['error', { max: 901 }],
            '@webpieces/enforce-architecture': 'error',
        },
    },
];
