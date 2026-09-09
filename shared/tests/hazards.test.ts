import { describe, expect, it } from 'vitest';

import type { HazardsConfig, Tile } from '../src/config/types';
import type {
    BlastEffect,
    BlastPlayer,
    BlastResult,
    BlastView,
    Chain,
    FuelItem,
    Fuse,
} from '../src/sim/hazards';
import {
    advanceChain,
    blastArea,
    buildFuelMap,
    choreStatus,
    dangerBeacon,
    expiredFuses,
    explosionAction,
    fuelAt,
    isBlastBin,
    knockbackTarget,
    lightFromSpark,
    nearestUndamagedStation,
    pickRingSparkTile,
    resolveBlast,
    ringFuel,
    tileFuseKey,
} from '../src/sim/hazards';
import { packTile } from '../src/sim/tiles';

/**
 * The pure half of hazards (contracts §10.5, docs/16). Every test here builds
 * the pile by hand, because the point of the module is that a blast is only
 * ever the arithmetic of what the players left lying around.
 */

const WIDTH = 12;
const HEIGHT = 10;

function config(over: Partial<HazardsConfig> = {}): HazardsConfig {
    return {
        fuseSeconds: 6,
        chainFuseSeconds: 1.5,
        blastRadius: 1,
        chainWindowSeconds: 3,
        sparks: { slammerRedline: 1, jammedPer10s: 0.5, crimpOnDented: 0.3 },
        fuel: { floorKeg: 1, spillTile: 1, shelfKeg: 1 },
        incidentThreshold: 4,
        factoryExplosionThreshold: 10,
        explosionEndsRound: true,
        dangerWarningAt: 0.5,
        stompSeconds: 1,
        stunSeconds: 2,
        knockbackTiles: 2,
        litKegCarry: true,
        repairSeconds: 10,
        bannerSeconds: 3,
        ...over,
    };
}

function keg(id: string, x: number, y: number): FuelItem {
    return { id, type: 'keg', x, y, holder: '', shelf: '', inFlight: false };
}

function shelved(id: string, stationId: string, shelf: 'in' | 'out'): FuelItem {
    return { id, type: 'keg', x: -1, y: -1, holder: stationId, shelf, inFlight: false };
}

const SHELVES: Record<string, Tile> = { 'powder-a:out': [7, 3], 'assembly-a:in': [2, 8] };

function shelfTileOf(stationId: string, shelf: 'in' | 'out'): Tile | undefined {
    return SHELVES[`${stationId}:${shelf}`];
}

/**
 * A whole factory floor as three arrays, so a chain can be stepped forward
 * without a `World`. `apply` is deliberately the dumbest possible reading of
 * `BlastEffect[]` — if the effect list needs interpreting, the server would
 * have to guess too.
 */
interface Model {
    items: FuelItem[];
    spills: number[];
    scorch: number[];
    walls: Set<number>;
    players: BlastPlayer[];
    fuses: Map<string, Fuse>;
    clock: number;
}

function model(over: Partial<Model> = {}): Model {
    return {
        items: [],
        spills: [],
        scorch: [],
        walls: new Set<number>(),
        players: [],
        fuses: new Map<string, Fuse>(),
        clock: 0,
        ...over,
    };
}

function viewOf(m: Model): BlastView {
    return {
        width: WIDTH,
        height: HEIGHT,
        items: m.items,
        spillTiles: m.spills,
        shelfTileOf,
        walls: m.walls,
        players: m.players,
    };
}

function apply(m: Model, result: BlastResult): void {
    for (const effect of result.effects) {
        if (effect.kind === 'destroyItem') {
            m.items = m.items.filter((item) => item.id !== effect.itemId);
        }

        if (effect.kind === 'lightFuse') m.fuses.set(effect.fuse.key, effect.fuse);

        if (effect.kind === 'scorch') {
            m.spills = m.spills.filter((tile) => tile !== effect.tile);

            if (!m.scorch.includes(effect.tile)) m.scorch.push(effect.tile);
        }

        if (effect.kind === 'knockback') {
            const player = m.players.find((p) => p.id === effect.sessionId);

            if (player !== undefined) {
                player.x = effect.x + 0.5;
                player.y = effect.y + 0.5;
            }
        }
    }
}

/** Blows every fuse that is due at `clock`, oldest key first, and counts kegs. */
function runTo(m: Model, clock: number, cfg: HazardsConfig): number {
    m.clock = clock;

    let kegs = 0;

    for (const key of expiredFuses(m.fuses, clock)) {
        const fuse = m.fuses.get(key);

        if (fuse === undefined) continue;
        if (fuse.itemId !== '' && !m.items.some((item) => item.id === fuse.itemId)) {
            m.fuses.delete(key);

            continue;
        }
        if (fuse.itemId === '' && !m.spills.includes(packTile(fuse.x, fuse.y, WIDTH))) {
            m.fuses.delete(key);

            continue;
        }

        m.fuses.delete(key);

        const result = resolveBlast(viewOf(m), fuse, m.fuses, clock, cfg);

        kegs += result.kegs;
        apply(m, result);
    }

    return kegs;
}

function lit(itemId: string, x: number, y: number, expiresAt: number): Fuse {
    return { key: itemId === '' ? tileFuseKey(packTile(x, y, WIDTH)) : itemId, itemId, x, y, expiresAt, chain: false };
}

function fuseKinds(effects: BlastEffect[]): Array<[string, number, number, number]> {
    return effects.flatMap((effect) =>
        effect.kind === 'lightFuse'
            ? [[effect.fuse.key, effect.fuse.x, effect.fuse.y, effect.fuse.expiresAt] as [string, number, number, number]]
            : [],
    );
}

describe('fuel', () => {
    it('counts a floor keg and a spill as one fuel each', () => {
        const map = buildFuelMap({
            width: WIDTH,
            items: [keg('k-1', 4, 4)],
            spillTiles: [packTile(5, 4, WIDTH)],
            shelfTileOf,
        });

        expect(fuelAt(map, 4, 4, WIDTH, config().fuel, 'spark')).toBe(1);
        expect(fuelAt(map, 5, 4, WIDTH, config().fuel, 'spark')).toBe(1);
        expect(fuelAt(map, 6, 4, WIDTH, config().fuel, 'spark')).toBe(0);
    });

    it('counts a shelf keg on its shelf tile for a blast and never for a spark', () => {
        const map = buildFuelMap({
            width: WIDTH,
            items: [shelved('k-1', 'powder-a', 'out'), shelved('k-2', 'powder-a', 'out')],
            spillTiles: [],
            shelfTileOf,
        });

        expect(fuelAt(map, 7, 3, WIDTH, config().fuel, 'spark')).toBe(0);
        expect(fuelAt(map, 7, 3, WIDTH, config().fuel, 'blast')).toBe(2);
    });

    it('ignores held kegs, flying kegs and everything that is not a keg', () => {
        const map = buildFuelMap({
            width: WIDTH,
            items: [
                { id: 'k-1', type: 'keg', x: -1, y: -1, holder: 'session-0', shelf: '', inFlight: false },
                { id: 'k-2', type: 'keg', x: 4, y: 4, holder: '', shelf: '', inFlight: true },
                { id: 's-1', type: 'stick', x: 4, y: 4, holder: '', shelf: '', inFlight: false },
                { id: 'c-1', type: 'casing', x: 4, y: 4, holder: '', shelf: '', inFlight: false },
            ],
            spillTiles: [],
            shelfTileOf,
        });

        expect(fuelAt(map, 4, 4, WIDTH, config().fuel, 'blast')).toBe(0);
    });

    it('sums the floor fuel standing in a station ring', () => {
        const ring: Tile[] = [
            [3, 4],
            [4, 4],
            [3, 5],
        ];
        const map = buildFuelMap({
            width: WIDTH,
            items: [keg('k-1', 3, 4), keg('k-2', 4, 4), shelved('k-3', 'powder-a', 'out')],
            spillTiles: [packTile(3, 5, WIDTH)],
            shelfTileOf,
        });

        expect(ringFuel(map, ring, WIDTH, config().fuel)).toBe(3);
    });
});

describe('sparks', () => {
    it('lights a six second fuse on the lowest id keg of the tile', () => {
        const map = buildFuelMap({
            width: WIDTH,
            items: [keg('k-9', 4, 4)],
            spillTiles: [packTile(4, 4, WIDTH)],
            shelfTileOf,
        });
        const fuse = lightFromSpark(map, 4, 4, WIDTH, 10, config(), new Map());

        expect(fuse).toEqual({ key: 'k-9', itemId: 'k-9', x: 4, y: 4, expiresAt: 16, chain: false });
    });

    it('lights a tile fuse on a bare spill and nothing on a bare tile', () => {
        const map = buildFuelMap({
            width: WIDTH,
            items: [],
            spillTiles: [packTile(4, 4, WIDTH)],
            shelfTileOf,
        });

        expect(lightFromSpark(map, 4, 4, WIDTH, 0, config(), new Map())?.itemId).toBe('');
        expect(lightFromSpark(map, 5, 4, WIDTH, 0, config(), new Map())).toBeNull();
    });

    it('picks the fullest ring tile and breaks ties on distance to the anchor', () => {
        const ring: Tile[] = [
            [7, 5],
            [3, 5],
            [4, 4],
        ];
        const full = buildFuelMap({
            width: WIDTH,
            items: [keg('k-1', 7, 5), keg('k-2', 3, 5)],
            spillTiles: [packTile(3, 5, WIDTH)],
            shelfTileOf,
        });

        expect(pickRingSparkTile(full, ring, [4, 2], WIDTH, config().fuel)).toEqual([3, 5]);

        const tied = buildFuelMap({
            width: WIDTH,
            items: [keg('k-1', 7, 5), keg('k-2', 4, 4)],
            spillTiles: [],
            shelfTileOf,
        });

        expect(pickRingSparkTile(tied, ring, [4, 2], WIDTH, config().fuel)).toEqual([4, 4]);
    });

    it('expires a fuse on the tick it is due and not the one before', () => {
        const fuses = new Map([['k-1', lit('k-1', 4, 4, 16)]]);
        let clock = 10;

        for (let tick = 0; tick < 119; tick++) clock += 0.05;
        expect(expiredFuses(fuses, clock)).toEqual([]);

        clock += 0.05;
        expect(expiredFuses(fuses, clock)).toEqual(['k-1']);
    });

    it('returns the due keys in a stable order', () => {
        const fuses = new Map([
            ['t-9', lit('', 9, 0, 1)],
            ['k-2', lit('k-2', 4, 4, 1)],
            ['k-1', lit('k-1', 5, 4, 1)],
        ]);

        expect(expiredFuses(fuses, 1)).toEqual(['k-1', 'k-2', 't-9']);
    });
});

describe('blastArea', () => {
    it('is the three by three around the origin, clipped to the map', () => {
        expect(blastArea(4, 4, 1, WIDTH, HEIGHT)).toHaveLength(9);
        expect(blastArea(0, 0, 1, WIDTH, HEIGHT)).toEqual([
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ]);
    });
});

describe('resolveBlast', () => {
    const cfg = config();

    it('destroys the origin keg and leaves everything that is not fuel alone', () => {
        const m = model({
            items: [
                keg('k-1', 4, 4),
                { id: 's-1', type: 'stick', x: 5, y: 4, holder: '', shelf: '', inFlight: false },
                { id: 'x-1', type: 'crate', x: 3, y: 4, holder: '', shelf: '', inFlight: false },
            ],
        });
        const result = resolveBlast(viewOf(m), lit('k-1', 4, 4, 0), m.fuses, 0, cfg);

        expect(result.kegs).toBe(1);
        expect(result.effects).toEqual([{ kind: 'destroyItem', itemId: 'k-1' }]);
    });

    it('lights a one and a half second chain fuse on every neighbour and nothing at distance two', () => {
        const m = model({
            items: [keg('k-1', 4, 4), keg('k-2', 5, 5), keg('k-3', 7, 4)],
            spills: [packTile(3, 3, WIDTH), packTile(4, 7, WIDTH)],
        });
        const result = resolveBlast(viewOf(m), lit('k-1', 4, 4, 0), m.fuses, 10, cfg);

        expect(fuseKinds(result.effects)).toEqual([
            ['t-39', 3, 3, 11.5],
            ['k-2', 5, 5, 11.5],
        ]);
        expect(result.effects.every((e) => e.kind !== 'lightFuse' || e.fuse.chain)).toBe(true);
    });

    it('shortens a fuse that is already burning instead of lengthening it', () => {
        const m = model({ items: [keg('k-1', 4, 4), keg('k-2', 5, 4)] });

        m.fuses.set('k-2', lit('k-2', 5, 4, 10.5));

        const short = resolveBlast(viewOf(m), lit('k-1', 4, 4, 0), m.fuses, 10, cfg);

        expect(fuseKinds(short.effects)).toEqual([['k-2', 5, 4, 10.5]]);

        m.fuses.set('k-2', lit('k-2', 5, 4, 14));

        const long = resolveBlast(viewOf(m), lit('k-1', 4, 4, 0), m.fuses, 10, cfg);

        expect(fuseKinds(long.effects)).toEqual([['k-2', 5, 4, 11.5]]);
    });

    it('lights every keg on an adjacent shelf and the ones sharing the origin shelf tile', () => {
        const m = model({
            items: [
                shelved('k-1', 'powder-a', 'out'),
                shelved('k-2', 'powder-a', 'out'),
                keg('k-3', 6, 4),
            ],
        });
        const result = resolveBlast(viewOf(m), lit('k-3', 6, 4, 0), m.fuses, 0, cfg);

        expect(fuseKinds(result.effects).map(([key]) => key)).toEqual(['k-1', 'k-2']);
        expect(fuseKinds(result.effects).map(([, x, y]) => [x, y])).toEqual([
            [7, 3],
            [7, 3],
        ]);
    });

    it('scorches the spill it went off on', () => {
        const m = model({ items: [keg('k-1', 4, 4)], spills: [packTile(4, 4, WIDTH)] });
        const result = resolveBlast(viewOf(m), lit('k-1', 4, 4, 0), m.fuses, 0, cfg);

        expect(result.effects).toContainEqual({ kind: 'scorch', tile: packTile(4, 4, WIDTH) });
    });

    it('knocks a bystander two tiles away from the origin', () => {
        const m = model({
            items: [keg('k-1', 4, 4)],
            players: [{ id: 'session-0', x: 5.5, y: 4.5, facing: 0 }],
        });
        const result = resolveBlast(viewOf(m), lit('k-1', 4, 4, 0), m.fuses, 0, cfg);

        expect(result.effects).toContainEqual({ kind: 'knockback', sessionId: 'session-0', x: 7, y: 4 });
    });

    it('leaves a bystander at distance two where they stand', () => {
        const m = model({
            items: [keg('k-1', 4, 4)],
            players: [{ id: 'session-0', x: 6.5, y: 4.5, facing: 0 }],
        });
        const result = resolveBlast(viewOf(m), lit('k-1', 4, 4, 0), m.fuses, 0, cfg);

        expect(result.effects.some((e) => e.kind === 'knockback')).toBe(false);
    });

    it('throws the holder of a keg that goes off in hand opposite their facing', () => {
        const m = model({
            items: [{ id: 'k-1', type: 'keg', x: -1, y: -1, holder: 'session-0', shelf: '', inFlight: false }],
            players: [{ id: 'session-0', x: 4.5, y: 4.5, facing: 0 }],
        });
        const result = resolveBlast(viewOf(m), lit('k-1', 4, 4, 0), m.fuses, 0, cfg);

        expect(result.effects).toContainEqual({ kind: 'knockback', sessionId: 'session-0', x: 2, y: 4 });
    });
});

describe('knockbackTarget', () => {
    const player: BlastPlayer = { id: 'session-0', x: 5.5, y: 4.5, facing: 0 };

    it('stops at the last tile before a wall', () => {
        const walls = new Set([packTile(7, 4, WIDTH)]);

        expect(knockbackTarget(player, 4, 4, walls, WIDTH, HEIGHT, 2)).toEqual([6, 4]);
    });

    it('stops at the edge of the map', () => {
        const edge: BlastPlayer = { id: 'session-0', x: 10.5, y: 4.5, facing: 0 };

        expect(knockbackTarget(edge, 9, 4, new Set(), WIDTH, HEIGHT, 2)).toEqual([11, 4]);
    });
});

describe('chains', () => {
    const cfg = config();

    it('carries a blast along a line of spills and scorches each one', () => {
        const m = model({
            items: [keg('k-1', 2, 4), keg('k-2', 5, 4)],
            spills: [packTile(3, 4, WIDTH), packTile(4, 4, WIDTH)],
        });

        m.fuses.set('k-1', lit('k-1', 2, 4, 6));

        expect(runTo(m, 6, cfg)).toBe(1);
        expect(runTo(m, 7.5, cfg)).toBe(0);
        expect(runTo(m, 9, cfg)).toBe(0);
        expect(runTo(m, 10.5, cfg)).toBe(1);
        expect(m.items).toEqual([]);
        expect(m.spills).toEqual([]);
        expect(m.scorch.sort()).toEqual([packTile(3, 4, WIDTH), packTile(4, 4, WIDTH)].sort());
    });

    it('takes a nine tile ring and a six keg shelf to fifteen', () => {
        const ring: Tile[] = [
            [3, 4],
            [4, 4],
            [6, 4],
            [7, 4],
            [3, 5],
            [4, 5],
            [5, 5],
            [6, 5],
            [7, 5],
        ];
        const m = model({
            items: [
                ...ring.map((t, i) => keg(`k-${10 + i}`, t[0], t[1])),
                ...Array.from({ length: 6 }, (_v, i) => shelved(`k-${20 + i}`, 'powder-a', 'out')),
            ],
        });

        m.fuses.set('k-10', lit('k-10', 3, 4, 6));

        let kegs = 0;

        for (let clock = 6; clock <= 30; clock += 1.5) kegs += runTo(m, clock, cfg);

        expect(kegs).toBe(15);
        expect(m.items).toEqual([]);
    });
});

describe('advanceChain', () => {
    const cfg = config();

    it('escalates once per tier and only to the highest tier crossed', () => {
        let chain: Chain | null = null;
        const seen: string[] = [];

        for (const kegs of [1, 1, 1, 1, 6]) {
            const step = advanceChain(chain, 0, kegs, cfg);

            chain = step.chain;
            seen.push(step.escalation);
        }

        expect(seen).toEqual(['whoops', 'none', 'none', 'incident', 'exploded']);
        expect(chain?.count).toBe(10);
    });

    it('jumps straight to exploded when one blast crosses two tiers', () => {
        const step = advanceChain({ count: 9, lastBlastAt: 0, firedTier: 'whoops' }, 1, 1, cfg);

        expect(step.escalation).toBe('exploded');
    });

    it('holds one chain across three seconds and starts a new one past it', () => {
        const first = advanceChain(null, 0, 1, cfg);

        expect(advanceChain(first.chain, 3, 1, cfg).chain.count).toBe(2);
        expect(advanceChain(first.chain, 3.05, 1, cfg).chain.count).toBe(1);
    });

    it('lets a spill blast extend the window without adding a keg', () => {
        const first = advanceChain(null, 0, 1, cfg);
        const spill = advanceChain(first.chain, 2, 0, cfg);

        expect(spill.escalation).toBe('none');
        expect(spill.chain.count).toBe(1);
        expect(advanceChain(spill.chain, 4.5, 1, cfg).chain.count).toBe(2);
    });
});

describe('outcomes', () => {
    const stations = [
        { id: 'powder-a', anchorX: 4, anchorY: 2, state: 'idle' },
        { id: 'assembly-a', anchorX: 12, anchorY: 8, state: 'idle' },
        { id: 'dock-a', anchorX: 4, anchorY: 2, state: 'idle' },
    ];

    it('picks the nearest undamaged station and breaks a tie on the id', () => {
        expect(nearestUndamagedStation(stations, 5, 3)).toBe('dock-a');
        expect(nearestUndamagedStation(stations, 12, 9)).toBe('assembly-a');
    });

    it('skips a station that is already damaged and gives up when all of them are', () => {
        const hurt = stations.map((s) => ({ ...s, state: s.id === 'dock-a' ? 'damaged' : s.state }));

        expect(nearestUndamagedStation(hurt, 5, 3)).toBe('powder-a');
        expect(nearestUndamagedStation(stations.map((s) => ({ ...s, state: 'damaged' })), 5, 3)).toBeNull();
    });

    it('ends the day only when the level says an explosion ends the round', () => {
        expect(explosionAction(config())).toBe('endDay');
        expect(explosionAction(config({ explosionEndsRound: false }))).toBe('setback');
    });
});

describe('beacon and bin', () => {
    const cfg = config();

    it('turns red at half the explosion threshold and back off below it', () => {
        expect(dangerBeacon('off', 5, cfg)).toBe('red');
        expect(dangerBeacon('red', 4.9, cfg)).toBe('off');
    });

    it('leaves a gold beacon alone below the line', () => {
        expect(dangerBeacon('gold', 4, cfg)).toBe('gold');
        expect(dangerBeacon('gold', 5, cfg)).toBe('red');
    });

    it('knows a blast bin tile from ordinary floor', () => {
        expect(isBlastBin([[3, 3]], 3, 3)).toBe(true);
        expect(isBlastBin([[3, 3]], 3, 4)).toBe(false);
        expect(isBlastBin([], 3, 3)).toBe(false);
    });
});

describe('choreStatus', () => {
    const chore = { sessionId: 'session-0', kind: 'repair' as const, target: 'powder-a', tile: [5, 4] as Tile, until: 10 };

    it('finishes on the tick the hold is due', () => {
        expect(choreStatus(chore, { x: 5.5, y: 4.5, stunnedUntil: 0 }, 9.99, true)).toBe('running');
        expect(choreStatus(chore, { x: 5.5, y: 4.5, stunnedUntil: 0 }, 10, true)).toBe('done');
    });

    it('is lost when the player moves, is stunned, or the target goes away', () => {
        expect(choreStatus(chore, { x: 6.5, y: 4.5, stunnedUntil: 0 }, 10, true)).toBe('cancelled');
        expect(choreStatus(chore, { x: 5.5, y: 4.5, stunnedUntil: 12 }, 10, true)).toBe('cancelled');
        expect(choreStatus(chore, { x: 5.5, y: 4.5, stunnedUntil: 0 }, 10, false)).toBe('cancelled');
    });
});
