import { describe, expect, it } from 'vitest';

import { FACING_DIRS, copy, rollDrop, scaleLevel } from '../src/shared';
import type {
    DropContext,
    FxKind,
    PlayerState,
    ScaledLevel,
    StationState,
    Tile,
    ToastMsg,
} from '../src/shared';
import { createItem, floorItemAt, giveToPlayer, placeOnFloor } from '../src/sim/items';
import { dropItem } from '../src/sim/itemDrop';
import type { World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * The drop table (contracts §10.4, docs/17): what the floor does to a thing
 * nobody caught. The `StationState` rows come from `stations.build`, which
 * `makeWorld` has already run.
 */

function playerOf(world: World, sessionId: string): PlayerState {
    const player = world.state.players.get(sessionId);

    if (player === undefined) throw new Error(`no player ${sessionId}`);

    return player;
}

/** The row `stations.build` made at `init`; a hand-built one would be detached. */
function stationStateFor(world: World, id: string): StationState {
    const st = world.state.stations.get(id);

    if (st === undefined) throw new Error(`no station ${id}`);

    return st;
}

function fxKinds(world: World): FxKind[] {
    return world.outbox.flatMap((out) => (out.name === 'fx' ? [out.payload.kind] : []));
}

function toasts(world: World): ToastMsg[] {
    return world.outbox.flatMap((out) => (out.name === 'toast' ? [out.payload] : []));
}

/** Puts a player on a tile the way the tick does, index included. */
function stand(world: World, sessionId: string, t: Tile): PlayerState {
    const player = playerOf(world, sessionId);

    player.x = t[0] + 0.5;
    player.y = t[1] + 0.5;
    world.reindexPlayers();

    return player;
}

describe('kegs', () => {
    it('rolls one tile on down an open aisle and thunks', () => {
        const world = makeWorld();
        const keg = createItem(world, 'keg');

        const outcome = dropItem(world, keg, [5, 7], [1, 0], '');

        expect(outcome).toMatchObject({ kind: 'keg', knockedOver: false });
        expect([keg.x, keg.y]).toEqual([6, 7]);
        expect(fxKinds(world)).toEqual(['thunk']);
    });

    it('knocks over against a wall into a spill, damp powder and a pfft', () => {
        const world = makeWorld();
        const keg = createItem(world, 'keg', { prime: true });

        const outcome = dropItem(world, keg, [26, 7], [1, 0], '');

        expect(outcome).toMatchObject({ knockedOver: true });
        expect([keg.x, keg.y]).toEqual([26, 7]);
        expect(keg.quality).toBeCloseTo(0.7);
        expect(keg.prime).toBe(false);
        expect(world.state.spillTiles).toContain(world.packTile(26, 7));
        expect(fxKinds(world)).toEqual(['pfft']);
    });

    it('never damps a keg below the dud floor', () => {
        const world = makeWorld();
        const keg = createItem(world, 'keg', { quality: 0.4 });

        dropItem(world, keg, [26, 7], [1, 0], '');

        expect(keg.quality).toBeCloseTo(0.4);
    });

    it('scraps a keg the crowded floor had nowhere to put, and bills the day', () => {
        const world = makeWorld();

        // Every tile `placeNear` can reach is taken, so the drop has nowhere to
        // land: docs/17's "nothing free within two tiles and it is gone".
        expect(placeOnFloor(world, createItem(world, 'keg'), [5, 7])).toBe(true);

        for (let radius = 1; radius <= 2; radius++) {
            for (const [dx, dy] of FACING_DIRS) {
                placeOnFloor(world, createItem(world, 'casing'), [
                    5 + dx * radius,
                    7 + dy * radius,
                ]);
            }
        }

        const keg = createItem(world, 'keg');

        dropItem(world, keg, [5, 7], [1, 0], '');

        expect(world.state.items.has(keg.id)).toBe(false);
        expect(fxKinds(world)).toContain('pfft');
        expect(world.tally.wastedByType.keg).toBe(1);
    });

    it('knocks over where it fell when a player is standing on the next tile', () => {
        const world = makeWorld({ players: 1 });
        const keg = createItem(world, 'keg');

        stand(world, 'session-0', [6, 7]);
        dropItem(world, keg, [5, 7], [1, 0], '');

        expect([keg.x, keg.y]).toEqual([5, 7]);
        expect(world.state.spillTiles).toContain(world.packTile(5, 7));
    });
});

describe('sticks', () => {
    it('fizzles: soots the nearest player, counts the loss and destroys the stick', () => {
        const world = makeWorld({ players: 2 });
        const near = stand(world, 'session-0', [5, 7]);
        const far = stand(world, 'session-1', [20, 7]);
        const stick = createItem(world, 'stick');

        world.level.carry.drop.stickFizzleChance = 1;

        const outcome = dropItem(world, stick, [6, 7], [1, 0], '');

        expect(outcome).toMatchObject({ kind: 'stick', fizzle: true });
        expect(world.state.items.has(stick.id)).toBe(false);
        expect(near.sooted).toBe(true);
        expect(far.sooted).toBe(false);
        expect(world.grooveEvents.fizzles).toBe(1);
        expect(world.tally.destroyedByType.stick).toBe(1);
        expect(fxKinds(world)).toEqual(['fizzle']);
    });

    it('sparks the tile it happened on, with no roll of its own', () => {
        const world = makeWorld({ players: 1 });

        world.startDay(scaleLevel(world.level, 3) as ScaledLevel);

        const keg = createItem(world, 'keg');

        expect(placeOnFloor(world, keg, [6, 7])).toBe(true);

        const stick = createItem(world, 'stick');

        world.level.carry.drop.stickFizzleChance = 1;
        world.outbox.length = 0;

        dropItem(world, stick, [6, 7], [1, 0], '');

        expect(keg.lit).toBe(true);
        expect(world.state.fuses.get(keg.id)?.secondsLeft).toBeCloseTo(6);
        expect(toasts(world)).toEqual([{ text: copy.hazards.sparks.fizzle, kind: 'warn' }]);
    });

    it('lands with one more dent when it does not fizzle', () => {
        const world = makeWorld();
        const stick = createItem(world, 'stick', { dents: 1 });

        world.level.carry.drop.stickFizzleChance = 0;

        dropItem(world, stick, [5, 7], [1, 0], '');

        expect(stick.dents).toBe(2);
        expect([stick.x, stick.y]).toEqual([5, 7]);
        expect(fxKinds(world)).toEqual(['thunk']);
    });

    it('fizzles roughly three times in ten over a seeded thousand', () => {
        const world = makeWorld({ seed: 99 });
        const ctx: DropContext = {
            blocked: () => false,
            occupied: () => false,
            workTileOwner: () => null,
        };

        let fizzles = 0;

        for (let i = 0; i < 1000; i++) {
            const outcome = rollDrop('stick', [5, 7], [1, 0], ctx, () => world.rng.next(), {
                stickFizzleChance: world.level.carry.drop.stickFizzleChance,
                kegKnockOverOnHit: true,
            });

            if (outcome.kind === 'stick' && outcome.fizzle) fizzles++;
        }

        expect(fizzles).toBeGreaterThanOrEqual(270);
        expect(fizzles).toBeLessThanOrEqual(330);
    });
});

describe('inert items and crowded floors', () => {
    it('drops a casing where it fell', () => {
        const world = makeWorld();
        const casing = createItem(world, 'casing');

        expect(dropItem(world, casing, [5, 7], [1, 0], '')).toMatchObject({ kind: 'inert' });
        expect([casing.x, casing.y]).toEqual([5, 7]);
    });

    it('takes the item out of the culprit hands before it rolls', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7]);
        const casing = createItem(world, 'casing');

        giveToPlayer(world, casing, 'session-0');
        dropItem(world, casing, [5, 7], [1, 0], 'session-0');

        expect(player.carrying).toBe('');
        expect(casing.holder).toBe('');
        expect(casing.x).toBeGreaterThanOrEqual(0);
    });

    it('puts the item beside a tile that already holds one', () => {
        const world = makeWorld();

        placeOnFloor(world, createItem(world, 'casing'), [6, 7]);

        const second = createItem(world, 'casing');

        dropItem(world, second, [5, 7], [1, 0], '');

        expect(floorItemAt(world, [6, 7])?.id).toBe('c-1');
        expect([second.x, second.y]).toEqual([5, 7]);
    });
});

describe('jamming', () => {
    it('jams a powder station an item comes to rest on and bubbles its workers', () => {
        const world = makeWorld({ players: 1 });
        const st = stationStateFor(world, 'powder-a');
        const operator = playerOf(world, 'session-0');

        operator.stationId = 'powder-a';

        const casing = createItem(world, 'casing');
        const outcome = dropItem(world, casing, [5, 4], [1, 0], '');

        expect(outcome.jamStationId).toBe('powder-a');
        expect(st.state).toBe('jammed');
        expect(operator.bubble).toBe(copy.bubbles.whoThrewThat);
        expect(operator.bubbleUntil).toBeCloseTo(world.now + 2);
    });

    it('leaves the dock alone: there is no machine there to jam', () => {
        const world = makeWorld();
        const st = stationStateFor(world, 'dock-a');
        const casing = createItem(world, 'casing');

        expect(dropItem(world, casing, [23, 5], [1, 0], '').jamStationId).toBeNull();
        expect(st.state).toBe('idle');
    });

    it('does not jam when the item bounced off the work tile onto another', () => {
        const world = makeWorld();
        const st = stationStateFor(world, 'assembly-a');

        placeOnFloor(world, createItem(world, 'casing'), [13, 9]);

        const second = createItem(world, 'casing');

        dropItem(world, second, [13, 9], [1, 0], '');

        expect([second.x, second.y]).not.toEqual([13, 9]);
        expect(st.state).toBe('idle');
    });
});
