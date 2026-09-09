import { layoutFixture, levelFixture } from '../../../shared/tests/fixtures/index';
import { FactoryState, validateLevelConfig } from '../../src/shared';
import type { LayoutConfig, LevelConfig } from '../../src/shared';
import { SYSTEMS } from '../../src/sim/systems';
import { World } from '../../src/sim/World';

/**
 * The one server test fixture (contracts §10.1). Every feature builds its world
 * through here, so a change to the tick order or the seating rules shows up in
 * every suite at once rather than in whichever file remembered to copy it.
 */

export interface MakeWorldOptions {
    level?: LevelConfig;
    layout?: LayoutConfig;
    seed?: number;
    players?: number;
}

/** The §13 defaults are what a room reads, so a test level goes through validation too. */
function withDefaults(level: LevelConfig): LevelConfig {
    const result = validateLevelConfig(level);

    if (!result.ok) throw new Error(result.errors.join('\n'));

    return result.value;
}

export function makeWorld(opts: MakeWorldOptions = {}): World {
    const level = withDefaults(opts.level ?? levelFixture());
    const layout = opts.layout ?? layoutFixture();

    const world = new World({
        config: {
            factory: { id: '7', name: 'Kaboom & Sons', day: 4, coin: 120, ownerUserId: 'u1' },
            level,
            layout,
            members: [],
        },
        state: new FactoryState(),
        seed: opts.seed ?? 1,
    });

    for (const system of SYSTEMS) world.registerSystem(system);

    world.init();

    for (let i = 0; i < (opts.players ?? 0); i++) {
        world.addPlayer(`session-${i}`, { userId: `u${i}`, name: `Player ${i}`, factoryId: '7' });
    }

    return world;
}
