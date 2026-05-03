import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
    {
        ignores: [
            'coverage/**',
            'dist/**',
            'node_modules/**'
        ]
    },
    js.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: {
                Buffer: 'readonly',
                clearTimeout: 'readonly',
                console: 'readonly',
                globalThis: 'readonly',
                process: 'readonly',
                setTimeout: 'readonly'
            },
            parser: tsParser,
            parserOptions: {
                sourceType: 'module'
            }
        },
        plugins: {
            '@typescript-eslint': tsPlugin
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }]
        }
    }
];
