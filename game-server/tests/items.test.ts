import { describe, expect, it } from 'vitest';

import { layoutFixture } from '../../shared/tests/fixtures/index';
import {
    FACING_DIRS,
    PlayerState,
    StationState,
    canShelve,
    resolveDelivery,
    scaleLevel,
    tileSpeedFactor,
} from '../src/shared';
import type { FxKind, LayoutConfig, ScaledLevel, Tile } from '../src/shared';
import {
    addSpill,
    canDeliver,
    createItem,
    deliverOutput,
    destroyItem,
    floorItemAt,
    giveToPlayer,
    isSpill,
    itemsSystem,
    onAction,
    onInteract,
    placeNear,
    placeOnFloor,
    releaseCarried,
    removeSpill,
    shelfPull,
    shelfPush,
    stageOnLane,
    takeCarried,
    tick,
} from '../src/sim/items';
import { spark } from '../src/sim/hazards';
import { dispatchMessage } from '../src/rooms/handlers';
import type { RoomControls } from '../src/rooms/handlers';
import { SYSTEMS } from '../src/sim/systems';
import type { World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

/**
 * The item entity rules (contracts §10.4): ids, shelves, the floor, hands and
 * the ADR 0012 delivery branch. The shelf tests build their own `StationState`
 * from the level config so a shelf rule can be read without the station runtime
 * around it.
 */

function playerOf(world: World, sessionId: string): PlayerState {
    const player = world.state.players.get(sessionId);

    if (player === undefined) throw new Error(`no player ${sessionId}`);

    return player;
}

function stationStateFor(world: World, id: string): StationState {
    const cfg = world.stationConfig(id);
    const st = new StationState();

    st.id = cfg.id;
    st.type = cfg.type;
    st.line = cfg.line;
    st.anchorX = cfg.anchor[0];
    st.anchorY = cfg.anchor[1];
    st.inputCap = cfg.inputShelf?.capacity ?? 0;
    st.outputCap = cfg.outputShelf?.capacity ?? 0;
    world.state.stations.set(st.id, st);

    return st;
}

/** A layout whose walls seal every tile `placeNear`'s ring search can reach. */
function sealedLayout(centre: Tile): LayoutConfig {
    const layout = layoutFixture();
    const walls = new Set(layout.walls);

    for (let radius = 1; radius <= 2; radius++) {
        for (const [dx, dy] of FACING_DIRS) {
            walls.add((centre[1] + dy * radius) * layout.width + (centre[0] + dx * radius));
        }
    }

    layout.walls = [...walls];

    return layout;
}

/** Puts a player on a tile facing a direction, index included. */
function stand(world: World, sessionId: string, t: Tile, facing: number): PlayerState {
    const player = playerOf(world, sessionId);

    player.x = t[0] + 0.5;
    player.y = t[1] + 0.5;
    player.facing = facing;
    world.reindexPlayers();

    return player;
}

function fxKinds(world: World): FxKind[] {
    return world.outbox.flatMap((out) => (out.name === 'fx' ? [out.payload.kind] : []));
}

describe('pure item rules', () => {
    it('maps all eight facings to unit steps starting east and going clockwise', () => {
        expect([...FACING_DIRS]).toEqual([
            [1, 0],
            [1, 1],
            [0, 1],
            [-1, 1],
            [-1, 0],
            [-1, -1],
            [0, -1],
            [1, -1],
        ]);
    });

    it('resolves a delivery to the shelf while the shelf has room', () => {
        expect(resolveDelivery(2, 4, '')).toBe('shelf');
        expect(resolveDelivery(2, 4, 'k-1')).toBe('shelf');
    });

    it('resolves a delivery to the hands when the shelf is full and the operator is empty-handed', () => {
        expect(resolveDelivery(4, 4, '')).toBe('hands');
        expect(resolveDelivery(0, 0, '')).toBe('hands');
    });

    it('resolves to null when the shelf is full and the operator is already carrying', () => {
        expect(resolveDelivery(4, 4, 'k-1')).toBeNull();
    });

    it('refuses a shelf push at capacity or of a type the shelf does not accept', () => {
        expect(canShelve(4, 4, ['keg'], 'keg')).toBe(false);
        expect(canShelve(0, 4, ['keg'], 'casing')).toBe(false);
        expect(canShelve(3, 4, ['keg', 'casing'], 'casing')).toBe(true);
    });

    it('slows a tile to the floor-item factor, the spill factor, or the lower of the two', () => {
        const cfg = { floorItemSpeed: 0.4, spillSpeed: 0.6 };

        expect(tileSpeedFactor(true, false, cfg)).toBe(0.4);
        expect(tileSpeedFactor(false, true, cfg)).toBe(0.6);
        expect(tileSpeedFactor(true, true, cfg)).toBe(0.4);
        expect(tileSpeedFactor(false, false, cfg)).toBe(1);
    });
});

describe('createItem and destroyItem', () => {
    it('allocates k-1, k-2 then s-1 and p-1 per world', () => {
        const world = makeWorld();

        expect(createItem(world, 'keg').id).toBe('k-1');
        expect(createItem(world, 'keg').id).toBe('k-2');
        expect(createItem(world, 'stick').id).toBe('s-1');
        expect(createItem(world, 'parts').id).toBe('p-1');
        expect(createItem(world, 'casing').id).toBe('c-1');
        expect(world.state.items.size).toBe(5);

        expect(createItem(makeWorld(), 'keg').id).toBe('k-1');
    });

    it('starts from the schema defaults and lets attrs override them', () => {
        const world = makeWorld();
        const plain = createItem(world, 'keg');
        const prime = createItem(world, 'stick', { quality: 0.7, prime: true, fuseLength: 'short' });

        expect([plain.type, plain.quality, plain.prime, plain.x, plain.y, plain.holder]).toEqual([
            'keg',
            1,
            false,
            -1,
            -1,
            '',
        ]);
        expect([prime.type, prime.quality, prime.prime, prime.fuseLength]).toEqual([
            'stick',
            0.7,
            true,
            'short',
        ]);
    });

    it('clears the carrier hands and the floor index when an item is destroyed', () => {
        const world = makeWorld({ players: 1 });
        const carried = createItem(world, 'keg');
        const dropped = createItem(world, 'keg');

        giveToPlayer(world, carried, 'session-0');
        placeOnFloor(world, dropped, [5, 7]);

        destroyItem(world, carried.id);
        destroyItem(world, dropped.id);

        expect(playerOf(world, 'session-0').carrying).toBe('');
        expect(world.itemsAt(5, 7)).toEqual([]);
        expect(world.state.items.size).toBe(0);
    });

    it('takes a destroyed item back off its shelf', () => {
        const world = makeWorld();
        const station = stationStateFor(world, 'assembly-a');
        const casing = createItem(world, 'casing');

        shelfPush(world, station, 'in', casing);
        destroyItem(world, casing.id);

        expect([...station.inputShelf]).toEqual([]);
    });
});

describe('shelves', () => {
    it('fills an input shelf to its cap and then refuses', () => {
        const world = makeWorld();
        const station = stationStateFor(world, 'assembly-a');

        station.inputCap = 2;

        expect(shelfPush(world, station, 'in', createItem(world, 'casing'))).toBe(true);
        expect(shelfPush(world, station, 'in', createItem(world, 'keg'))).toBe(true);
        expect(shelfPush(world, station, 'in', createItem(world, 'casing'))).toBe(false);
        expect([...station.inputShelf]).toEqual(['c-1', 'k-1']);
    });

    it('parks a pushed item on the shelf with no position of its own', () => {
        const world = makeWorld();
        const station = stationStateFor(world, 'assembly-a');
        const keg = createItem(world, 'keg');

        shelfPush(world, station, 'in', keg);

        expect([keg.holder, keg.shelf, keg.x, keg.y]).toEqual(['assembly-a', 'in', -1, -1]);
    });

    it('refuses a type the input shelf does not accept', () => {
        const world = makeWorld();
        const station = stationStateFor(world, 'assembly-a');

        expect(shelfPush(world, station, 'in', createItem(world, 'stick'))).toBe(false);
        expect([...station.inputShelf]).toEqual([]);
    });

    it('accepts only the recipe output type on an output shelf', () => {
        const world = makeWorld();
        const powder = stationStateFor(world, 'powder-a');

        expect(shelfPush(world, powder, 'out', createItem(world, 'casing'))).toBe(false);
        expect(shelfPush(world, powder, 'out', createItem(world, 'keg'))).toBe(true);
        expect([...powder.outputShelf]).toEqual(['k-1']);
    });

    it('pulls the newest item by default and the named index when asked', () => {
        const world = makeWorld();
        const station = stationStateFor(world, 'assembly-a');

        shelfPush(world, station, 'in', createItem(world, 'casing'));
        shelfPush(world, station, 'in', createItem(world, 'casing'));
        shelfPush(world, station, 'in', createItem(world, 'casing'));

        expect(shelfPull(world, station, 'in')?.id).toBe('c-3');
        expect(shelfPull(world, station, 'in', 0)?.id).toBe('c-1');
        expect([...station.inputShelf]).toEqual(['c-2']);
    });

    it('leaves a pulled item in the machine and returns null on an empty shelf', () => {
        const world = makeWorld();
        const station = stationStateFor(world, 'assembly-a');
        const casing = createItem(world, 'casing');

        shelfPush(world, station, 'in', casing);

        expect(shelfPull(world, station, 'in')).toBe(casing);
        expect([casing.holder, casing.shelf]).toEqual(['assembly-a', '']);
        expect(shelfPull(world, station, 'in')).toBeNull();
    });
});

describe('the floor', () => {
    it('places an item on a tile and finds it there again', () => {
        const world = makeWorld();
        const keg = createItem(world, 'keg');

        expect(placeOnFloor(world, keg, [5, 7])).toBe(true);
        expect([keg.x, keg.y, keg.holder, keg.shelf]).toEqual([5, 7, '', '']);
        expect(floorItemAt(world, [5, 7])).toBe(keg);
        expect(floorItemAt(world, [6, 7])).toBeNull();
        expect(world.itemsAt(5, 7)).toEqual(['k-1']);
    });

    it('refuses a wall, a blast bin, a shelf tile and a tile that already holds an item', () => {
        const layout = layoutFixture();

        // The assembly input shelf is furniture, but the tile is only a wall by
        // convention — an item may not be stacked on it either way.
        layout.walls = layout.walls.filter((packed) => packed !== 9 * layout.width + 12);

        const world = makeWorld({ layout });

        expect(placeOnFloor(world, createItem(world, 'keg'), [0, 0])).toBe(false);
        expect(placeOnFloor(world, createItem(world, 'keg'), [3, 3])).toBe(false);
        expect(placeOnFloor(world, createItem(world, 'keg'), [12, 9])).toBe(false);
        expect(placeOnFloor(world, createItem(world, 'keg'), [5, 7])).toBe(true);
        expect(placeOnFloor(world, createItem(world, 'keg'), [5, 7])).toBe(false);
    });

    it('lets a lit item land in a blast bin', () => {
        const world = makeWorld();
        const keg = createItem(world, 'keg');

        keg.lit = true;

        expect(placeOnFloor(world, keg, [3, 3])).toBe(true);
    });

    it('refuses a tile a player is standing on', () => {
        const world = makeWorld({ players: 1 });
        const player = playerOf(world, 'session-0');

        player.x = 5.5;
        player.y = 7.5;
        world.reindexPlayers();

        expect(placeOnFloor(world, createItem(world, 'keg'), [5, 7])).toBe(false);
    });

    it('ring-searches around an occupied tile', () => {
        const world = makeWorld();

        placeOnFloor(world, createItem(world, 'keg'), [5, 7]);

        const second = createItem(world, 'keg');

        expect(placeNear(world, second, [5, 7])).toBe(true);
        expect([second.x, second.y]).toEqual([6, 7]);
    });

    it('gives up when nothing within two tiles is free', () => {
        const world = makeWorld({ layout: sealedLayout([5, 7]) });

        placeOnFloor(world, createItem(world, 'keg'), [5, 7]);

        const second = createItem(world, 'keg');

        expect(placeNear(world, second, [5, 7])).toBe(false);
        expect([second.x, second.y]).toEqual([-1, -1]);
    });
});

describe('hands', () => {
    it('refuses a player whose hands are full and empties them again', () => {
        const world = makeWorld({ players: 2 });
        const first = createItem(world, 'keg');
        const second = createItem(world, 'keg');

        expect(giveToPlayer(world, first, 'session-0')).toBe(true);
        expect([first.holder, first.x, first.y]).toEqual(['session-0', -1, -1]);
        expect(playerOf(world, 'session-0').carrying).toBe('k-1');
        expect(giveToPlayer(world, second, 'session-0')).toBe(false);

        playerOf(world, 'session-1').carrying = 'broom';

        expect(giveToPlayer(world, second, 'session-1')).toBe(false);
        expect(giveToPlayer(world, second, 'nobody')).toBe(false);

        expect(takeCarried(world, 'session-0')).toBe(first);
        expect([first.holder, first.x, first.y]).toEqual(['', -1, -1]);
        expect(playerOf(world, 'session-0').carrying).toBe('');
    });

    it('returns null for empty hands and for the broom', () => {
        const world = makeWorld({ players: 1 });

        expect(takeCarried(world, 'session-0')).toBeNull();

        playerOf(world, 'session-0').carrying = 'broom';

        expect(takeCarried(world, 'session-0')).toBeNull();
        expect(playerOf(world, 'session-0').carrying).toBe('broom');
    });

    it('takes an item off the floor when it is handed to a player', () => {
        const world = makeWorld({ players: 1 });
        const keg = createItem(world, 'keg');

        placeOnFloor(world, keg, [5, 7]);

        expect(giveToPlayer(world, keg, 'session-0')).toBe(true);
        expect(world.itemsAt(5, 7)).toEqual([]);
    });
});

describe('delivery (ADR 0012)', () => {
    it('shelves the output while the output shelf has room', () => {
        const world = makeWorld({ players: 1 });
        const powder = stationStateFor(world, 'powder-a');
        const keg = createItem(world, 'keg');

        expect(canDeliver(world, powder, 'session-0')).toBe(true);
        expect(deliverOutput(world, powder, keg, 'session-0')).toBe('shelf');
        expect([...powder.outputShelf]).toEqual(['k-1']);
        expect(playerOf(world, 'session-0').carrying).toBe('');
    });

    it('hands the output to the operator when the shelf is full', () => {
        const world = makeWorld({ players: 1 });
        const powder = stationStateFor(world, 'powder-a');

        powder.outputCap = 1;
        shelfPush(world, powder, 'out', createItem(world, 'keg'));

        const keg = createItem(world, 'keg');

        expect(canDeliver(world, powder, 'session-0')).toBe(true);
        expect(deliverOutput(world, powder, keg, 'session-0')).toBe('hands');
        expect(keg.holder).toBe('session-0');
        expect(playerOf(world, 'session-0').carrying).toBe('k-2');
    });

    it('hands over an output the shelf will not take back', () => {
        const world = makeWorld({ players: 1 });
        const powder = stationStateFor(world, 'powder-a');
        const casing = createItem(world, 'casing');

        expect(deliverOutput(world, powder, casing, 'session-0')).toBe('hands');
        expect([...powder.outputShelf]).toEqual([]);
        expect(playerOf(world, 'session-0').carrying).toBe('c-1');
    });

    it('refuses to arm another cycle while the shelf is full and the operator holds the last one', () => {
        const world = makeWorld({ players: 1 });
        const powder = stationStateFor(world, 'powder-a');

        powder.outputCap = 0;
        giveToPlayer(world, createItem(world, 'keg'), 'session-0');

        expect(canDeliver(world, powder, 'session-0')).toBe(false);
        expect(() => deliverOutput(world, powder, createItem(world, 'keg'), 'session-0')).toThrow(
            /powder-a/,
        );
    });
});

describe('lanes and spills', () => {
    it('stages an item on a dock lane without making it a floor item', () => {
        const world = makeWorld({ players: 1 });
        const stick = createItem(world, 'stick');

        giveToPlayer(world, stick, 'session-0');
        stageOnLane(world, stick, 'dock-a', [23, 5]);

        expect([stick.holder, stick.shelf, stick.x, stick.y]).toEqual(['dock-a', '', 23, 5]);
        expect(playerOf(world, 'session-0').carrying).toBe('');
        expect(world.itemsAt(23, 5)).toEqual([]);
        expect(floorItemAt(world, [23, 5])).toBeNull();
    });

    it('adds a spill once, keeps walls clean, and removes it again', () => {
        const world = makeWorld();

        addSpill(world, [5, 7]);
        addSpill(world, [5, 7]);
        addSpill(world, [0, 0]);

        expect([...world.state.spillTiles]).toEqual([world.packTile(5, 7)]);
        expect(isSpill(world, [5, 7])).toBe(true);
        expect(isSpill(world, [6, 7])).toBe(false);

        removeSpill(world, [5, 7]);

        expect([...world.state.spillTiles]).toEqual([]);
        expect(isSpill(world, [5, 7])).toBe(false);
    });
});

describe('the items system', () => {
    it('runs after stations in the tick order', () => {
        const names = SYSTEMS.map((system) => system.name);

        expect(itemsSystem.name).toBe('items');
        expect(names.indexOf('items')).toBe(names.indexOf('stations') + 1);
    });
});

describe('interact: picking things up', () => {
    it('takes the floor item on the faced tile', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7], 0);

        placeOnFloor(world, createItem(world, 'keg'), [6, 7]);

        expect(onInteract(world, player)).toBe(true);
        expect(player.carrying).toBe('k-1');
        expect(world.itemsAt(6, 7)).toEqual([]);
    });

    it('takes the newest item off a faced shelf', () => {
        const world = makeWorld({ players: 1 });
        const st = stationStateFor(world, 'assembly-a');
        const player = stand(world, 'session-0', [11, 9], 0);

        shelfPush(world, st, 'in', createItem(world, 'keg'));
        shelfPush(world, st, 'in', createItem(world, 'keg'));

        expect(onInteract(world, player)).toBe(true);
        expect(player.carrying).toBe('k-2');
        expect([...st.inputShelf]).toEqual(['k-1']);
    });

    it('leaves a lit item on the floor when the level says hands off', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7], 0);
        const keg = createItem(world, 'keg');

        keg.lit = true;
        placeOnFloor(world, keg, [6, 7]);
        world.level.hazards.litKegCarry = false;

        expect(onInteract(world, player)).toBe(true);
        expect(player.carrying).toBe('');
        expect(fxKinds(world)).toEqual(['bonk']);
    });

    it('takes the broom off its hook and hangs it back up', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [3, 10], 4);

        expect(onInteract(world, player)).toBe(true);
        expect(player.carrying).toBe('broom');
        expect(onInteract(world, player)).toBe(true);
        expect(player.carrying).toBe('');
    });

    it('leaves the broom alone while somebody else has it', () => {
        const world = makeWorld({ players: 2 });
        const first = stand(world, 'session-0', [3, 10], 4);
        const second = stand(world, 'session-1', [3, 10], 4);

        onInteract(world, first);

        expect(onInteract(world, second)).toBe(false);
        expect(second.carrying).toBe('');
    });

    it('passes on a press with the broom that is not aimed at the hook', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7], 0);

        player.carrying = 'broom';

        expect(onInteract(world, player)).toBe(false);
    });

    it('starts an unjam on a jammed station tile', () => {
        const world = makeWorld({ players: 1 });
        const st = stationStateFor(world, 'powder-a');
        const player = stand(world, 'session-0', [4, 4], 0);

        st.state = 'jammed';

        expect(onInteract(world, player)).toBe(true);
        expect(player.chore).toBe('unjam');
    });

    it('ignores a second press while a chore is running', () => {
        const world = makeWorld({ players: 1 });
        const st = stationStateFor(world, 'powder-a');
        const player = stand(world, 'session-0', [4, 4], 0);

        st.state = 'jammed';
        onInteract(world, player);
        placeOnFloor(world, createItem(world, 'keg'), [5, 4]);

        expect(onInteract(world, player)).toBe(true);
        expect(player.carrying).toBe('');
    });

    it('passes the press on when the faced tile has nothing to offer', () => {
        const world = makeWorld({ players: 1 });

        expect(onInteract(world, stand(world, 'session-0', [5, 7], 0))).toBe(false);
    });
});

describe('interact: putting things down', () => {
    it('places the carried item on the faced floor tile and locks the legs', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7], 0);

        giveToPlayer(world, createItem(world, 'keg'), 'session-0');
        world.state.clock = 10;

        expect(onInteract(world, player)).toBe(true);
        expect(player.carrying).toBe('');
        expect(floorItemAt(world, [6, 7])?.id).toBe('k-1');
        expect(player.stunnedUntil).toBeCloseTo(10.3);
    });

    it('shelves the carried item on a faced shelf with room', () => {
        const world = makeWorld({ players: 1 });
        const st = stationStateFor(world, 'assembly-a');
        const player = stand(world, 'session-0', [11, 9], 0);

        giveToPlayer(world, createItem(world, 'keg'), 'session-0');

        expect(onInteract(world, player)).toBe(true);
        expect([...st.inputShelf]).toEqual(['k-1']);
        expect(player.carrying).toBe('');
    });

    it('bonks and keeps hold of it when the shelf will not take it', () => {
        const world = makeWorld({ players: 1 });
        const st = stationStateFor(world, 'assembly-a');
        const player = stand(world, 'session-0', [11, 9], 0);

        st.inputCap = 0;
        giveToPlayer(world, createItem(world, 'keg'), 'session-0');

        expect(onInteract(world, player)).toBe(true);
        expect(player.carrying).toBe('k-1');
        expect(fxKinds(world)).toEqual(['bonk']);
    });

    it('bonks rather than stacking on a tile that already holds an item', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7], 0);

        placeOnFloor(world, createItem(world, 'keg'), [6, 7]);
        giveToPlayer(world, createItem(world, 'keg'), 'session-0');

        expect(onInteract(world, player)).toBe(true);
        expect(player.carrying).toBe('k-2');
        expect(fxKinds(world)).toEqual(['bonk']);
    });

    it('passes the press on rather than dropping the item on a work tile', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [4, 4], 0);

        giveToPlayer(world, createItem(world, 'keg'), 'session-0');

        expect(onInteract(world, player)).toBe(false);
        expect(player.carrying).toBe('k-1');
    });
});

describe('interact at a stand station', () => {
    it('hands every press but a catch to the station module', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [23, 5], 0);

        player.stationId = 'dock-a';
        placeOnFloor(world, createItem(world, 'stick'), [24, 5]);

        expect(onInteract(world, player)).toBe(false);
        expect(player.carrying).toBe('');
    });

    it('still lets the docker take a stick out of the air', () => {
        const world = makeWorld({ players: 2 });
        const thrower = stand(world, 'session-0', [21, 5], 0);
        const docker = stand(world, 'session-1', [23, 5], 4);

        docker.stationId = 'dock-a';
        giveToPlayer(world, createItem(world, 'stick'), 'session-0');
        onAction(world, thrower, 0);
        world.state.clock = 0.5;

        expect(onInteract(world, docker, 500)).toBe(true);
        expect(docker.carrying).toBe('s-1');
    });
});

describe('action', () => {
    it('throws what the player is carrying', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7], 0);

        giveToPlayer(world, createItem(world, 'keg'), 'session-0');

        expect(onAction(world, player, 0)).toBe(true);
        expect(world.state.items.get('k-1')?.inFlight).toBe(true);
    });

    it('sweeps the spill underfoot when the broom is in hand', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7], 0);

        player.carrying = 'broom';
        addSpill(world, [5, 7]);

        expect(onAction(world, player, 0)).toBe(true);
        expect(player.chore).toBe('sweep');
    });

    it('passes the press on with the broom on a clean tile, empty hands, or mid-chore', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7], 0);

        expect(onAction(world, player, 0)).toBe(false);

        player.carrying = 'broom';

        expect(onAction(world, player, 0)).toBe(false);

        player.carrying = '';
        player.chore = 'stomp';

        expect(onAction(world, player, 0)).toBe(false);
    });
});

describe('the items tick', () => {
    it('shakes a carried item loose on a bump and charges the mover a drop', () => {
        const world = makeWorld({ players: 2 });
        const mover = stand(world, 'session-0', [5, 7], 0);

        stand(world, 'session-1', [6, 7], 4);
        giveToPlayer(world, createItem(world, 'keg'), 'session-0');
        world.emit('bump', {
            a: 'session-0',
            b: 'session-1',
            mover: 'session-0',
            x: 6,
            y: 7.5,
            dx: 1,
            dy: 0,
        });
        tick(world, 0.05);

        expect(mover.carrying).toBe('');
        expect(world.state.items.get('k-1')?.x).toBeGreaterThanOrEqual(0);
        expect(world.tally.players.get('u0')?.drops).toBe(1);
        expect(fxKinds(world)).toContain('bonk');
    });

    it('never shakes the broom loose', () => {
        const world = makeWorld({ players: 2 });
        const mover = stand(world, 'session-0', [5, 7], 0);

        mover.carrying = 'broom';
        world.emit('bump', {
            a: 'session-0',
            b: 'session-1',
            mover: 'session-0',
            x: 6,
            y: 7.5,
            dx: 1,
            dy: 0,
        });
        tick(world, 0.05);

        expect(mover.carrying).toBe('broom');
        expect(world.tally.players.get('u0')).toBeUndefined();
    });

    it('counts the items lying in each station floor ring', () => {
        const world = makeWorld();
        const st = stationStateFor(world, 'powder-a');

        placeOnFloor(world, createItem(world, 'keg'), [3, 4]);
        placeOnFloor(world, createItem(world, 'keg'), [4, 5]);
        placeOnFloor(world, createItem(world, 'keg'), [5, 7]);
        tick(world, 0.05);

        expect(st.floorCount).toBe(2);
    });

    it('advances flights and chores from the same tick', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7], 0);

        giveToPlayer(world, createItem(world, 'keg'), 'session-0');
        onAction(world, player, 0);
        world.state.clock = 0.25;
        tick(world, 0.05);

        expect(world.state.items.get('k-1')?.flightT).toBeCloseTo(0.5);
    });
});

describe('releaseCarried', () => {
    it('puts a disconnecting player item down on their own tile without a drop table', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7], 0);
        const keg = createItem(world, 'keg', { prime: true });

        giveToPlayer(world, keg, 'session-0');
        releaseCarried(world, 'session-0');

        expect(player.carrying).toBe('');
        expect(keg.holder).toBe('');
        expect([keg.x, keg.y]).toEqual([5, 7]);
        expect(keg.prime).toBe(true);
        expect([...world.state.spillTiles]).toEqual([]);
        expect(world.tally.players.get('u0')).toBeUndefined();
    });

    it('steps aside when something is already sitting where they stand', () => {
        const world = makeWorld({ players: 1 });

        placeOnFloor(world, createItem(world, 'keg'), [5, 7]);
        stand(world, 'session-0', [5, 7], 0);
        giveToPlayer(world, createItem(world, 'keg'), 'session-0');
        releaseCarried(world, 'session-0');

        const dropped = world.state.items.get('k-2');

        expect(dropped?.holder).toBe('');
        expect([dropped?.x, dropped?.y]).not.toEqual([5, 7]);
        expect(dropped?.x).toBeGreaterThanOrEqual(0);
    });

    it('hangs the broom back up', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7], 0);

        player.carrying = 'broom';
        releaseCarried(world, 'session-0');

        expect(player.carrying).toBe('');
    });

    it('destroys the item when there is nowhere within two tiles to put it', () => {
        const world = makeWorld({ layout: sealedLayout([5, 7]), players: 1 });

        placeOnFloor(world, createItem(world, 'keg'), [5, 7]);
        stand(world, 'session-0', [5, 7], 0);
        giveToPlayer(world, createItem(world, 'keg'), 'session-0');
        releaseCarried(world, 'session-0');

        expect(world.state.items.has('k-2')).toBe(false);

        // Gone is gone: a keg the floor had no room for still cost the factory,
        // so the day is billed for it rather than quietly refunded.
        expect(world.tally.wastedByType.keg).toBe(1);
    });
});

describe('the F10 hooks this feature owes (contracts §10.4)', () => {
    /** The one tile F10 answers differently, so the seam is visible from here. */
    function bin(world: World): Tile {
        const tile = world.layout.blastBins[0];

        if (tile === undefined) throw new Error('no blast bin');

        return tile;
    }

    it('every floor placement calls hazards.onItemLanded, and a saved return leaves nothing', () => {
        const world = makeWorld({ players: 1 });

        world.startDay(scaleLevel(world.level, 3) as ScaledLevel);

        const keg = createItem(world, 'keg');

        expect(placeOnFloor(world, keg, [3, 4])).toBe(true);
        expect(spark(world, 3, 4, 'fizzle')).toBe('lit');
        expect(keg.lit).toBe(true);

        expect(placeOnFloor(world, keg, bin(world))).toBe(true);
        expect(world.state.items.has(keg.id)).toBe(false);
        expect(floorItemAt(world, bin(world))).toBeNull();
    });

    it('leaves an ordinary landing alone', () => {
        const world = makeWorld({ players: 1 });

        world.startDay(scaleLevel(world.level, 3) as ScaledLevel);

        const keg = createItem(world, 'keg');

        expect(placeOnFloor(world, keg, [6, 5])).toBe(true);
        expect(spark(world, 6, 5, 'fizzle')).toBe('lit');
        expect(placeOnFloor(world, keg, [7, 5])).toBe(true);
        expect(floorItemAt(world, [7, 5])).toBe(keg);
    });
});

describe('the items system hooks', () => {
    it('subscribes to bumps at world build and ticks through the same entry point', () => {
        expect(itemsSystem.init).toBeTypeOf('function');
        expect(itemsSystem.tick).toBe(tick);
    });
});

describe('the interact and action dispatch entries', () => {
    const controls: RoomControls = {
        startDay: () => {},
        sendConfig: () => {},
    };

    it('picks up through interact and throws through action', () => {
        const world = makeWorld({ players: 1 });
        const player = stand(world, 'session-0', [5, 7], 0);

        placeOnFloor(world, createItem(world, 'keg'), [6, 7]);
        dispatchMessage(world, controls, 'session-0', 'interact', {});

        expect(player.carrying).toBe('k-1');

        dispatchMessage(world, controls, 'session-0', 'action', { t: 0 });

        expect(world.state.items.get('k-1')?.inFlight).toBe(true);
    });

    it('judges an interact carrying a client timestamp against the server clock', () => {
        const world = makeWorld({ players: 2 });
        const thrower = stand(world, 'session-0', [5, 7], 0);
        const catcher = stand(world, 'session-1', [7, 7], 4);

        giveToPlayer(world, createItem(world, 'keg'), 'session-0');
        onAction(world, thrower, 0);
        world.state.clock = 0.5;
        dispatchMessage(world, controls, 'session-1', 'interact', { t: 500 });

        expect(catcher.carrying).toBe('k-1');
    });
});
