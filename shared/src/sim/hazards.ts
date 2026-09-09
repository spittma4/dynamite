import type { HazardsConfig, Tile } from '../config/types';
import type { Beacon, ItemType, ShelfSide } from '../schema/types';
import type { Facing } from './tiles';
import { facingVector, inBounds, packTile, tileOf } from './tiles';

/**
 * What burns, what lights it and what puts it out (contracts §10.5, docs/16).
 * Nothing here rolls a die or reads a clock: the caller has already decided
 * that a spark happened, and this module only answers whether there was
 * anything on that tile for it to catch. That split is the design — the pile
 * was built by the players, so the consequence has to be theirs too.
 */

export type SparkCause = 'slammerRedline' | 'jammed' | 'fizzle' | 'crimpOnDented';
/** A spark only ever finds floor fuel; a blast also reaches the shelves beside it. */
export type FuelMode = 'spark' | 'blast';

export interface FuelItem {
    id: string;
    type: ItemType;
    x: number;
    y: number;
    holder: string;
    shelf: ShelfSide;
    inFlight: boolean;
}

export interface FuelView {
    width: number;
    items: ReadonlyArray<FuelItem>;
    spillTiles: ReadonlyArray<number>;
    shelfTileOf: (stationId: string, shelf: 'in' | 'out') => Tile | undefined;
}

export interface FuelCell {
    x: number;
    y: number;
    floorKegs: string[];
    spill: boolean;
    shelfKegs: string[];
}

/** Keyed by `packTile`, so it lines up with `walls`, `spillTiles` and `scorchTiles`. */
export type FuelMap = ReadonlyMap<number, FuelCell>;

export interface Fuse {
    key: string;
    /** `''` for a spill-tile fuse; the burning keg otherwise. */
    itemId: string;
    x: number;
    y: number;
    expiresAt: number;
    chain: boolean;
}

/** Keyed by item id for a keg fuse and `t-<packed tile>` for a spill fuse. */
export type FuseMap = ReadonlyMap<string, Fuse>;

export interface HazardChore {
    sessionId: string;
    kind: 'stomp' | 'repair';
    /** A fuse key for a stomp, a station id for a repair. */
    target: string;
    tile: Tile;
    until: number;
}

export type ChoreStatus = 'running' | 'done' | 'cancelled';

/** A hold that ends on the tick it is due, not the one after. */
const EPSILON = 1e-6;

function cellAt(map: Map<number, FuelCell>, x: number, y: number, width: number): FuelCell {
    const packed = packTile(x, y, width);
    let cell = map.get(packed);

    if (cell === undefined) {
        cell = { x, y, floorKegs: [], spill: false, shelfKegs: [] };
        map.set(packed, cell);
    }

    return cell;
}

/**
 * A held keg is in someone's hands, not on the pile: it contributes nothing,
 * which is what makes carrying a lit one to the bin a play rather than a way of
 * spreading the fire.
 */
export function buildFuelMap(view: FuelView): FuelMap {
    const map = new Map<number, FuelCell>();

    for (const item of view.items) {
        if (item.type !== 'keg') continue;

        if (item.holder === '') {
            if (item.inFlight || item.x < 0) continue;

            const [tx, ty] = tileOf(item.x, item.y);

            cellAt(map, tx, ty, view.width).floorKegs.push(item.id);

            continue;
        }

        if (item.shelf === '') continue;

        const tile = view.shelfTileOf(item.holder, item.shelf);

        if (tile === undefined) continue;

        cellAt(map, tile[0], tile[1], view.width).shelfKegs.push(item.id);
    }

    for (const packed of view.spillTiles) {
        const y = Math.floor(packed / view.width);

        cellAt(map, packed - y * view.width, y, view.width).spill = true;
    }

    return map;
}

export function fuelAt(
    map: FuelMap,
    x: number,
    y: number,
    width: number,
    weights: HazardsConfig['fuel'],
    mode: FuelMode,
): number {
    const cell = map.get(packTile(x, y, width));

    if (cell === undefined) return 0;

    const floor = cell.floorKegs.length * weights.floorKeg + (cell.spill ? weights.spillTile : 0);

    if (mode === 'spark') return floor;

    return floor + cell.shelfKegs.length * weights.shelfKeg;
}

export function tileFuseKey(tile: number): string {
    return `t-${tile}`;
}

/** Both a keg fuse and a tile fuse are found by where they are burning. */
export function fuseOnTile(fuses: FuseMap, x: number, y: number): Fuse | null {
    for (const fuse of fuses.values()) {
        if (fuse.x === x && fuse.y === y) return fuse;
    }

    return null;
}

/**
 * The keg wins over the puddle it is standing in: a fuse the players can pick
 * up and run to the bin is always the more interesting one.
 */
export function lightFromSpark(
    map: FuelMap,
    x: number,
    y: number,
    width: number,
    clock: number,
    cfg: HazardsConfig,
    fuses: FuseMap,
): Fuse | null {
    if (fuelAt(map, x, y, width, cfg.fuel, 'spark') === 0) return null;
    if (fuseOnTile(fuses, x, y) !== null) return null;

    const cell = map.get(packTile(x, y, width));
    const itemId = cell === undefined ? undefined : [...cell.floorKegs].sort()[0];

    return {
        key: itemId ?? tileFuseKey(packTile(x, y, width)),
        itemId: itemId ?? '',
        x,
        y,
        expiresAt: clock + cfg.fuseSeconds,
        chain: false,
    };
}

/**
 * Where a station's spark lands: the fullest tile of its floor ring, then the
 * one nearest the machine, then the order the level listed them in. Redlining
 * with a clean ring still has to pick a tile, so the players see the spark that
 * would have caught them.
 */
export function pickRingSparkTile(
    map: FuelMap,
    ring: ReadonlyArray<Tile>,
    anchor: Tile,
    width: number,
    weights: HazardsConfig['fuel'],
): Tile | null {
    let best: Tile | null = null;
    let bestFuel = -1;
    let bestDistance = 0;

    for (const tile of ring) {
        const fuel = fuelAt(map, tile[0], tile[1], width, weights, 'spark');
        const dx = tile[0] - anchor[0];
        const dy = tile[1] - anchor[1];
        const distance = dx * dx + dy * dy;

        if (fuel > bestFuel || (fuel === bestFuel && distance < bestDistance)) {
            best = tile;
            bestFuel = fuel;
            bestDistance = distance;
        }
    }

    return best;
}

/**
 * The server cannot see a key going up, so a hold is "press, then stand still".
 * Being knocked off the tile is the only way to lose one, which is why a blast
 * beside you costs the stomp you were half way through.
 */
export function choreStatus(
    chore: HazardChore,
    player: { x: number; y: number; stunnedUntil: number },
    clock: number,
    targetOk: boolean,
): ChoreStatus {
    const [tx, ty] = tileOf(player.x, player.y);

    if (tx !== chore.tile[0] || ty !== chore.tile[1]) return 'cancelled';
    if (clock < player.stunnedUntil) return 'cancelled';
    if (!targetOk) return 'cancelled';

    return clock + EPSILON >= chore.until ? 'done' : 'running';
}

/** Nothing has gone off yet, then one keg, then a machine, then the factory. */
export type ChainTier = 'none' | 'whoops' | 'incident' | 'exploded';

export interface BlastPlayer {
    id: string;
    x: number;
    y: number;
    facing: number;
}

export interface BlastView extends FuelView {
    height: number;
    /** Packed, so it lines up with `LayoutConfig.walls`. */
    walls: ReadonlySet<number>;
    players: ReadonlyArray<BlastPlayer>;
}

export type BlastEffect =
    | { kind: 'destroyItem'; itemId: string }
    | { kind: 'lightFuse'; fuse: Fuse }
    | { kind: 'scorch'; tile: number }
    | { kind: 'knockback'; sessionId: string; x: number; y: number };

export interface BlastResult {
    origin: Tile;
    /** A tile fuse takes the floor with it but destroys no keg. */
    kegs: 0 | 1;
    effects: BlastEffect[];
}

export interface Chain {
    count: number;
    lastBlastAt: number;
    firedTier: ChainTier;
}

/** The knockback walks out in quarter tiles so a wall stops it where it stands. */
const KNOCKBACK_STEP = 0.25;

const TIER_RANK: Record<ChainTier, number> = { none: 0, whoops: 1, incident: 2, exploded: 3 };

export function ringFuel(
    map: FuelMap,
    ring: ReadonlyArray<Tile>,
    width: number,
    weights: HazardsConfig['fuel'],
): number {
    let total = 0;

    for (const tile of ring) total += fuelAt(map, tile[0], tile[1], width, weights, 'spark');

    return total;
}

/** Sorted, so a tick with several expiries resolves the same way twice. */
export function expiredFuses(fuses: FuseMap, clock: number): string[] {
    const due: string[] = [];

    for (const [key, fuse] of fuses) {
        if (clock + EPSILON >= fuse.expiresAt) due.push(key);
    }

    return due.sort();
}

export function blastArea(
    x: number,
    y: number,
    radius: number,
    width: number,
    height: number,
): Tile[] {
    const tiles: Tile[] = [];

    for (let ty = y - radius; ty <= y + radius; ty++) {
        for (let tx = x - radius; tx <= x + radius; tx++) {
            if (inBounds(tx, ty, width, height)) tiles.push([tx, ty]);
        }
    }

    return tiles;
}

/**
 * Away from the blast, or — for the player holding the keg, who is standing on
 * the origin itself — backwards. Quarter-tile steps stop at the last tile that
 * is really floor, so nobody is thrown through a machine.
 */
export function knockbackTarget(
    player: BlastPlayer,
    originX: number,
    originY: number,
    walls: ReadonlySet<number>,
    width: number,
    height: number,
    tiles: number,
): Tile {
    let dx = player.x - (originX + 0.5);
    let dy = player.y - (originY + 0.5);
    const length = Math.hypot(dx, dy);

    if (length < 1e-6) {
        const facing = (((Math.round(player.facing) % 8) + 8) % 8) as Facing;
        const away = facingVector(facing);

        dx = -away.dx;
        dy = -away.dy;
    } else {
        dx /= length;
        dy /= length;
    }

    let best = tileOf(player.x, player.y);

    for (let step = 1; step <= Math.round(tiles / KNOCKBACK_STEP); step++) {
        const tile = tileOf(player.x + dx * step * KNOCKBACK_STEP, player.y + dy * step * KNOCKBACK_STEP);

        if (!inBounds(tile[0], tile[1], width, height)) break;
        if (walls.has(packTile(tile[0], tile[1], width))) break;

        best = tile;
    }

    return best;
}

/** A burning fuse is shortened by a blast beside it, never given more time. */
function chainFuse(
    fuses: FuseMap,
    key: string,
    itemId: string,
    x: number,
    y: number,
    clock: number,
    cfg: HazardsConfig,
): Fuse {
    const burning = fuses.get(key);
    const chained = clock + cfg.chainFuseSeconds;

    return {
        key,
        itemId,
        x,
        y,
        expiresAt: burning === undefined ? chained : Math.min(burning.expiresAt, chained),
        chain: true,
    };
}

/**
 * One fuse going off, as a list of things the caller must write down. The
 * blast destroys exactly the keg that was burning: everything else it touches
 * it only lights, which is what gives the players the 1.5 s to run.
 */
export function resolveBlast(
    view: BlastView,
    fuse: Fuse,
    fuses: FuseMap,
    clock: number,
    cfg: HazardsConfig,
): BlastResult {
    const map = buildFuelMap(view);
    const origin: Tile = [fuse.x, fuse.y];
    const kegs: 0 | 1 = fuse.itemId === '' ? 0 : 1;
    const effects: BlastEffect[] = [];

    if (fuse.itemId !== '') effects.push({ kind: 'destroyItem', itemId: fuse.itemId });

    const area = blastArea(origin[0], origin[1], cfg.blastRadius, view.width, view.height);

    for (const [tx, ty] of area) {
        const packed = packTile(tx, ty, view.width);
        const cell = map.get(packed);

        if (cell === undefined) continue;

        if (cell.spill && (tx !== origin[0] || ty !== origin[1])) {
            const key = tileFuseKey(packed);

            effects.push({ kind: 'lightFuse', fuse: chainFuse(fuses, key, '', tx, ty, clock, cfg) });
        }

        for (const id of [...cell.floorKegs, ...cell.shelfKegs]) {
            if (id === fuse.itemId) continue;

            effects.push({ kind: 'lightFuse', fuse: chainFuse(fuses, id, id, tx, ty, clock, cfg) });
        }
    }

    const originCell = map.get(packTile(origin[0], origin[1], view.width));

    if (originCell?.spill === true) {
        effects.push({ kind: 'scorch', tile: packTile(origin[0], origin[1], view.width) });
    }

    for (const player of view.players) {
        const [px, py] = tileOf(player.x, player.y);

        if (!area.some((tile) => tile[0] === px && tile[1] === py)) continue;

        const [tx, ty] = knockbackTarget(
            player,
            origin[0],
            origin[1],
            view.walls,
            view.width,
            view.height,
            cfg.knockbackTiles,
        );

        effects.push({ kind: 'knockback', sessionId: player.id, x: tx, y: ty });
    }

    return { origin, kegs, effects };
}

function tierFor(count: number, cfg: HazardsConfig): ChainTier {
    if (count >= cfg.factoryExplosionThreshold) return 'exploded';
    if (count >= cfg.incidentThreshold) return 'incident';

    return count >= 1 ? 'whoops' : 'none';
}

/**
 * Everything inside three seconds of the last bang is one accident, so a chain
 * of six is an INCIDENT rather than six separate WHOOPSes. A tier fires once:
 * the chain remembers how far it has already escalated.
 */
export function advanceChain(
    chain: Chain | null,
    clock: number,
    kegs: number,
    cfg: HazardsConfig,
): { chain: Chain; escalation: ChainTier } {
    const running =
        chain !== null && clock - chain.lastBlastAt <= cfg.chainWindowSeconds + EPSILON;
    const next: Chain = running
        ? { count: chain.count + kegs, lastBlastAt: clock, firedTier: chain.firedTier }
        : { count: kegs, lastBlastAt: clock, firedTier: 'none' };
    const tier = tierFor(next.count, cfg);

    if (TIER_RANK[tier] <= TIER_RANK[next.firedTier]) return { chain: next, escalation: 'none' };

    next.firedTier = tier;

    return { chain: next, escalation: tier };
}

/** Ties go to the lowest id, so the same accident always damages the same machine. */
export function nearestUndamagedStation(
    stations: ReadonlyArray<{ id: string; anchorX: number; anchorY: number; state: string }>,
    x: number,
    y: number,
): string | null {
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const station of stations) {
        if (station.state === 'damaged') continue;

        const dx = station.anchorX - x;
        const dy = station.anchorY - y;
        const distance = dx * dx + dy * dy;

        if (distance > bestDistance) continue;
        if (distance === bestDistance && best !== null && station.id >= best) continue;

        best = station.id;
        bestDistance = distance;
    }

    return best;
}

export function explosionAction(cfg: HazardsConfig): 'endDay' | 'setback' {
    return cfg.explosionEndsRound ? 'endDay' : 'setback';
}

/**
 * Red is F10's and gold is the Slammer's: below the line the beacon only ever
 * takes back its own colour, so a hot streak is not cancelled by a tidy floor.
 */
export function dangerBeacon(current: Beacon, fuel: number, cfg: HazardsConfig): Beacon {
    if (fuel >= cfg.dangerWarningAt * cfg.factoryExplosionThreshold) return 'red';

    return current === 'red' ? 'off' : current;
}

export function isBlastBin(bins: ReadonlyArray<Tile>, x: number, y: number): boolean {
    return bins.some((bin) => bin[0] === x && bin[1] === y);
}
