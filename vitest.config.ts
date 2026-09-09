import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The client suite (contracts §12, F04). `shared/` and `game-server/` run their
 * own vitest inside their workspace; this config exists so the browser code,
 * which lives outside every workspace, has one too.
 */

const sharedDir = fileURLToPath(new URL('./shared/src', import.meta.url));

export default defineConfig({
    resolve: {
        alias: [
            { find: /^@shared$/, replacement: `${sharedDir}/index.ts` },
            { find: /^@shared\//, replacement: `${sharedDir}/` },
        ],
    },
    test: {
        include: ['resources/js/game/__tests__/**/*.test.ts'],
        environment: 'node',
    },
});
