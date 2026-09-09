import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { validateLevelConfig } from '../src/config/validate';

const LEVELS_DIR = fileURLToPath(new URL('../../config/game/levels', import.meta.url));

function shippedLevels(): string[] {
    if (!existsSync(LEVELS_DIR)) return [];

    return readdirSync(LEVELS_DIR)
        .filter((name) => name.endsWith('.json'))
        .sort();
}

const levels = shippedLevels();

describe('the levels this repo ships', () => {
    if (levels.length === 0) {
        // F12 ships config/game/levels/*.json in wave 5; until then there is
        // nothing here to check and the reference fixture carries the coverage.
        it.skip('validates every level in config/game/levels (none shipped yet)', () => {});

        return;
    }

    it.each(levels)('accepts %s', (name) => {
        const raw: unknown = JSON.parse(readFileSync(join(LEVELS_DIR, name), 'utf8'));
        const result = validateLevelConfig(raw);

        expect(result.ok ? [] : result.errors).toEqual([]);
    });

    it.each(levels)('names %s after its file', (name) => {
        const raw = JSON.parse(readFileSync(join(LEVELS_DIR, name), 'utf8')) as { key?: string };

        expect(raw.key).toBe(name.replace(/\.json$/, ''));
    });
});
