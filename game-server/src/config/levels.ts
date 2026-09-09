import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import type { Env } from '../env';
import { LaravelUnreachableError, fetchFactoryConfig } from '../laravel/api';
import type { FactoryConfigResponse } from '../laravel/api';
import { validateLayoutConfig, validateLevelConfig, validateLevelOnLayout } from '../shared';
import type { LayoutConfig, LevelConfig } from '../shared';
import { devFactoryConfig } from './devLevel';

/**
 * Where a room's config comes from: Laravel first, the level files on disk when
 * Laravel is unreachable, and the built-in dev level when there are no files
 * either. Every path ends in the same validation, so a room either starts with
 * a level that satisfies contracts §8 or does not start at all.
 */

function readJsonFile(file: string): unknown {
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch (cause) {
        throw new Error(`${file} is not readable JSON: ${String(cause)}`);
    }
}

function firstLevelFile(levelsDir: string): string | null {
    if (!existsSync(levelsDir)) return null;

    // Alphabetical, so the seeded `level-01-…` is the one a dev machine picks up.
    const files = readdirSync(levelsDir)
        .filter((name) => name.endsWith('.json'))
        .sort();

    return files[0] === undefined ? null : path.join(levelsDir, files[0]);
}

/** Contracts §2: there is no `LAYOUTS_DIR` — layouts sit beside the levels. */
function layoutFileFor(levelsDir: string, key: string): string {
    return path.join(levelsDir, '..', 'layouts', `${key}.json`);
}

/**
 * The room cannot run a level whose tiles do not fit its map, so every loader
 * ends here and throws the whole list at once rather than the first fault.
 */
function validated(config: {
    factory: FactoryConfigResponse['factory'];
    level: unknown;
    layout: unknown;
    members: FactoryConfigResponse['members'];
}): FactoryConfigResponse {
    const level = validateLevelConfig(config.level);

    if (!level.ok) throw new Error(level.errors.join('\n'));

    const layout = validateLayoutConfig(config.layout);

    if (!layout.ok) throw new Error(layout.errors.join('\n'));

    const errors = validateLevelOnLayout(level.value, layout.value);

    if (errors.length > 0) throw new Error(errors.join('\n'));

    return { factory: config.factory, level: level.value, layout: layout.value, members: config.members };
}

export function loadLocalFactoryConfig(levelsDir: string, factoryId: string): FactoryConfigResponse {
    const file = firstLevelFile(levelsDir);

    if (file === null) return validated(devFactoryConfig(factoryId));

    const level = readJsonFile(file) as LevelConfig;
    const layoutFile = layoutFileFor(levelsDir, level.layout);

    if (!existsSync(layoutFile)) throw new Error(`${file} names a layout with no file: ${layoutFile}`);

    return validated({
        factory: { id: factoryId, name: 'Local factory', day: 1, coin: 0, ownerUserId: '' },
        level,
        layout: readJsonFile(layoutFile) as LayoutConfig,
        members: [],
    });
}

export async function resolveFactoryConfig(
    env: Env,
    factoryId: string,
    players: number,
    fetchImpl: typeof fetch = fetch,
): Promise<{ config: FactoryConfigResponse; source: 'laravel' | 'local' }> {
    try {
        const config = await fetchFactoryConfig(env, factoryId, players, fetchImpl);

        return { config: validated(config), source: 'laravel' };
    } catch (error) {
        if (!(error instanceof LaravelUnreachableError)) throw error;

        console.warn(`laravel unreachable (${error.message}); falling back to ${env.LEVELS_DIR}`);

        return {
            config: loadLocalFactoryConfig(path.resolve(env.LEVELS_DIR), factoryId),
            source: 'local',
        };
    }
}
