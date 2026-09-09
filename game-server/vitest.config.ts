import { defineConfig } from 'vitest/config';

/**
 * Without a config of its own vitest walks up to the repo root and picks up the
 * client suite instead of this one.
 */

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'node',
    },
});
