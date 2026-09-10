import {
    FACING_DIRS,
    ITEM_ID_PREFIX,
    ItemState,
    LEVEL_DEFAULTS,
    canShelve,
    resolveDelivery,
} from '../shared';
import type { ItemType, PlayerState, StationState, StationType, Tile } from '../shared';
import { beginSweep, beginUnjam, tickChores } from './chores';
import type { ChoreTarget } from './chores';
import { onItemLanded } from './hazards';
import { dropItem } from './itemDrop';
import { startThrow, tickFlights, tryCatch } from './itemThrow';
import type { Flight } from './itemThrow';
import type { BumpEvent, System, World } from './World';

export { dropItem } from './itemDrop';

/**
 * Every keg, casing, stick and parts bundle in the factory (contracts §10.4).
 * An item is in exactly one place — a shelf, a pair of hands, a floor tile, a
 * dock lane or the air — and every verb here moves it from one to the next, so
 * nothing can be half on a shelf and half in someone's arms.
 */

/**
 * Everything this feature knows that the schema does not. It hangs off a
 * `WeakMap` keyed by the world so two rooms never share a counter and nothing
 * outlives the room (contracts §14).
 */
export interface ItemStore {
    nextId: Record<ItemType, number>;
    /** In-flight items, keyed by item id. */
    flights: Map<string, Flight>;
    /** The chore each player is part way through, keyed by session id. */
    chores: Map<string, ChoreTarget>;
    /** Bump events buffered by `itemsSystem.init` and drained by `tick`. */
    bumps: BumpEvent[];
}

const stores = new WeakMap<World, ItemStore>();

export function itemStore(world: World): ItemStore {
    let store = stores.get(world);

    if (store === undefined) {
        store = {
            nextId: { keg: 0, casing: 0, stick: 0, crate: 0, parts: 0 },
            flights: new Map(),
            chores: new Map(),
            bumps: [],
        };
        stores.set(world, store);
    }

    return store;
}

/** Where an `fx` for a tile is drawn, and the one place that knows the offset. */
export function tileCentre(t: Tile): [number, number] {
    return [t[0] + 0.5, t[1] + 0.5];
}

function sameTile(a: Tile, b: Tile): boolean {
    return a[0] === b[0] && a[1] === b[1];
}

/** Derived from the schema so this module never has to import Colyseus itself. */
type Shelf = StationState['inputShelf'];

function shelfArray(station: StationState, side: 'in' | 'out'): Shelf {
    return side === 'in' ? station.inputShelf : station.outputShelf;
}

/** An output shelf takes back exactly what its station makes. */
function acceptsFor(world: World, station: StationState, side: 'in' | 'out'): readonly ItemType[] {
    const cfg = world.stationConfig(station.id);

    if (side === 'in') return cfg.inputShelf?.accepts ?? [];

    return outputTypeFor(world, cfg.type);
}

function outputTypeFor(world: World, type: StationType): readonly ItemType[] {
    for (const recipe of Object.values(world.level.recipes)) {
        if (recipe.station === type) return [recipe.output.type];
    }

    return [];
}

function isShelfTile(world: World, tx: number, ty: number): boolean {
    for (const cfg of world.level.stations) {
        for (const shelf of [cfg.inputShelf, cfg.outputShelf]) {
            const tile = shelf?.tile;

            if (tile !== undefined && tile[0] === tx && tile[1] === ty) return true;
        }
    }

    return false;
}

/** A bin is blocked furniture until the thing coming at it is on fire (F10's hot potato). */
function isBlastBin(world: World, tx: number, ty: number): boolean {
    return world.layout.blastBins.some((bin) => bin[0] === tx && bin[1] === ty);
}

/**
 * Shared with `itemThrow` and `itemDrop`: nothing may come to rest on furniture,
 * off the map, or in a bin it is not on fire enough to deserve.
 */
export function blockedForItems(world: World, tx: number, ty: number, lit: boolean): boolean {
    if (world.isWall(tx, ty)) return true;
    if (isShelfTile(world, tx, ty)) return true;

    return !lit && isBlastBin(world, tx, ty);
}

/**
 * Lifts the item out of wherever it currently is. Every placement verb starts
 * here, so a shelf slot or a pair of hands can never keep a claim on an item
 * that has moved on.
 */
function detach(world: World, item: ItemState): void {
    if (item.holder !== '') {
        const player = world.state.players.get(item.holder);

        if (player?.carrying === item.id) player.carrying = '';

        const station = world.state.stations.get(item.holder);

        if (station !== undefined) {
            for (const side of ['in', 'out'] as const) {
                const shelf = shelfArray(station, side);
                const at = shelf.indexOf(item.id);

                if (at >= 0) shelf.splice(at, 1);
            }
        }
    }

    item.holder = '';
    item.shelf = '';
    item.inFlight = false;
    item.x = -1;
    item.y = -1;
}

export function createItem(
    world: World,
    type: ItemType,
    attrs?: Partial<
        Pick<
            ItemState,
            'quality' | 'prime' | 'dents' | 'fuseLength' | 'fill' | 'capLoose' | 'frayed' | 'orderId'
        >
    >,
): ItemState {
    const store = itemStore(world);
    const item = new ItemState();

    item.id = `${ITEM_ID_PREFIX[type]}-${++store.nextId[type]}`;
    item.type = type;

    if (attrs !== undefined) Object.assign(item, attrs);

    world.state.items.set(item.id, item);

    return item;
}

export function destroyItem(world: World, itemId: string): void {
    const item = world.state.items.get(itemId);

    if (item === undefined) return;

    detach(world, item);
    world.state.items.delete(itemId);
    world.reindexItems();
}

export function floorItemAt(world: World, t: Tile): ItemState | null {
    for (const id of world.itemsAt(t[0], t[1])) {
        const item = world.state.items.get(id);

        if (item !== undefined) return item;
    }

    return null;
}

export function placeOnFloor(world: World, item: ItemState, t: Tile): boolean {
    return putDown(world, item, t, '') !== 'blocked';
}

/**
 * What became of an item that came to rest. `saved` is the blast bin: the item
 * reached the tile and F10 took it from there, so it is off the floor and gone.
 */
type Landing = 'blocked' | 'placed' | 'saved';

/**
 * `ignoreSessionId` is the one player whose feet do not block the tile: a
 * disconnect sets the item down where its carrier stood, and that carrier is
 * still standing there until the room removes them (contracts §11).
 */
function putDown(world: World, item: ItemState, t: Tile, ignoreSessionId: string): Landing {
    const [tx, ty] = t;

    if (blockedForItems(world, tx, ty, item.lit)) return 'blocked';

    const sitting = floorItemAt(world, t);

    if (sitting !== null && sitting !== item) return 'blocked';
    if (world.playersAt(tx, ty).some((held) => held !== ignoreSessionId)) return 'blocked';

    detach(world, item);
    item.x = tx;
    item.y = ty;
    world.reindexItems();

    // Every landing and every floor put-down comes through here, so this is the
    // one place F10 has to be asked (contracts §10.4). It is asked after the
    // write, because a bin has to know which tile the item reached.
    return onItemLanded(world, item.id, tx, ty) === 'saved' ? 'saved' : 'placed';
}

/** The ring is walked in `FACING_DIRS` order so the same drop always lands the same way. */
export function placeNear(world: World, item: ItemState, t: Tile): boolean {
    return placeOnFloor(world, item, t) || placeBeside(world, item, t);
}

/**
 * Everywhere `placeNear` searches except the tile itself, for the one tile an
 * item must never settle on: the Jig's aisle refuses every swing while anything
 * is lying on it, so a missed toss that landed there stopped the line with its
 * own debris and nothing on any surface said why.
 */
export function placeBeside(world: World, item: ItemState, t: Tile): boolean {
    for (let radius = 1; radius <= 2; radius++) {
        for (const [dx, dy] of FACING_DIRS) {
            if (placeOnFloor(world, item, [t[0] + dx * radius, t[1] + dy * radius])) return true;
        }
    }

    return false;
}

export function giveToPlayer(world: World, item: ItemState, sessionId: string): boolean {
    const player = world.state.players.get(sessionId);

    if (player === undefined || player.carrying !== '') return false;

    detach(world, item);
    item.holder = sessionId;
    player.carrying = item.id;
    world.reindexItems();

    return true;
}

export function takeCarried(world: World, sessionId: string): ItemState | null {
    const player = world.state.players.get(sessionId);

    if (player === undefined || player.carrying === '' || player.carrying === 'broom') return null;

    const item = world.state.items.get(player.carrying);

    // The hands empty either way: an id with no item behind it is a ghost from
    // something destroyed mid-carry, and holding onto it would wedge the player.
    player.carrying = '';

    if (item === undefined) return null;

    item.holder = '';
    item.shelf = '';
    item.x = -1;
    item.y = -1;

    return item;
}

export function canDeliver(world: World, station: StationState, operatorId: string): boolean {
    return deliveryFor(world, station, operatorId) !== null;
}

/**
 * ADR 0012: the shelf first, the operator's hands second. There is no third
 * option — F05 checks `canDeliver` before it arms a cycle, so a station that
 * completes one with nowhere to put the output is a bug worth hearing about.
 */
export function deliverOutput(
    world: World,
    station: StationState,
    item: ItemState,
    operatorId: string,
): 'shelf' | 'hands' {
    const mode = deliveryFor(world, station, operatorId);

    if (mode === 'shelf' && shelfPush(world, station, 'out', item)) return 'shelf';
    if (mode !== null && giveToPlayer(world, item, operatorId)) return 'hands';

    throw new Error(`deliverOutput: ${station.id} can neither shelve nor hand over ${item.id}`);
}

function deliveryFor(
    world: World,
    station: StationState,
    operatorId: string,
): 'shelf' | 'hands' | null {
    const carrying = world.state.players.get(operatorId)?.carrying ?? '';

    return resolveDelivery(station.outputShelf.length, station.outputCap, carrying);
}

export function shelfPush(
    world: World,
    station: StationState,
    side: 'in' | 'out',
    item: ItemState,
): boolean {
    const shelf = shelfArray(station, side);
    const cap = side === 'in' ? station.inputCap : station.outputCap;

    if (!canShelve(shelf.length, cap, acceptsFor(world, station, side), item.type as ItemType)) {
        return false;
    }

    detach(world, item);
    item.holder = station.id;
    item.shelf = side;
    shelf.push(item.id);
    world.reindexItems();

    return true;
}

/**
 * Players always take the newest; a station names the index it seated. The item
 * comes back with the station still holding it — it is inside the machine now,
 * and the caller says where it goes next.
 */
export function shelfPull(
    world: World,
    station: StationState,
    side: 'in' | 'out',
    index?: number,
): ItemState | null {
    const shelf = shelfArray(station, side);
    const at = index ?? shelf.length - 1;

    if (at < 0 || at >= shelf.length) return null;

    const id = shelf[at];

    shelf.splice(at, 1);

    const item = id === undefined ? undefined : world.state.items.get(id);

    if (item === undefined) return null;

    item.holder = station.id;
    item.shelf = '';
    item.x = -1;
    item.y = -1;

    return item;
}

export function addSpill(world: World, t: Tile): void {
    const [tx, ty] = t;

    if (world.isWall(tx, ty)) return;

    const packed = world.packTile(tx, ty);

    if (world.state.spillTiles.includes(packed)) return;

    world.state.spillTiles.push(packed);
}

export function removeSpill(world: World, t: Tile): void {
    const at = world.state.spillTiles.indexOf(world.packTile(t[0], t[1]));

    if (at >= 0) world.state.spillTiles.splice(at, 1);
}

export function isSpill(world: World, t: Tile): boolean {
    return world.isSpill(t[0], t[1]);
}

/** A dock lane holds a stick on a tile without it being loose on the floor (F09). */
export function stageOnLane(world: World, item: ItemState, stationId: string, t: Tile): void {
    detach(world, item);
    item.holder = stationId;
    item.shelf = '';
    item.x = t[0];
    item.y = t[1];
    world.reindexItems();
}


interface ShelfAt {
    station: StationState;
    side: 'in' | 'out';
}

function shelfAt(world: World, t: Tile): ShelfAt | null {
    for (const cfg of world.level.stations) {
        const station = world.state.stations.get(cfg.id);

        if (station === undefined) continue;

        const input = cfg.inputShelf;
        const output = cfg.outputShelf;

        if (input != null && sameTile(input.tile, t)) return { station, side: 'in' };
        if (output != null && sameTile(output.tile, t)) return { station, side: 'out' };
    }

    return null;
}

/** Work, rack and shelf tiles alike: anywhere you can reach a machine from. */
function stationTileAt(world: World, t: Tile): string | null {
    for (const cfg of world.level.stations) {
        const tiles: Tile[] = [...cfg.workTiles, ...cfg.rackTiles];

        if (cfg.inputShelf != null) tiles.push(cfg.inputShelf.tile);
        if (cfg.outputShelf != null) tiles.push(cfg.outputShelf.tile);

        if (tiles.some((tile) => sameTile(tile, t))) return cfg.id;
    }

    return null;
}

function isWorkTile(world: World, t: Tile): boolean {
    return world.level.stations.some((cfg) => cfg.workTiles.some((tile) => sameTile(tile, t)));
}

function broomTaken(world: World): boolean {
    let taken = false;

    world.state.players.forEach((player) => {
        if (player.carrying === 'broom') taken = true;
    });

    return taken;
}

function putDownSeconds(world: World): number {
    return world.level.carry.putDownSeconds ?? LEVEL_DEFAULTS.carry.putDownSeconds;
}

/**
 * Rule 3: a shelf with room, else the faced floor tile. A work tile is refused
 * outright so the press falls through to the station — an operator holding
 * output presses `E` to leave, not to bury the machine under it.
 */
function putDownItem(world: World, player: PlayerState, faced: Tile): boolean {
    const item = world.state.items.get(player.carrying);

    if (item === undefined) return false;

    const shelf = shelfAt(world, faced);

    if (shelf !== null) {
        if (!shelfPush(world, shelf.station, shelf.side, item)) world.fx('bonk', ...tileCentre(faced));

        return true;
    }

    if (isWorkTile(world, faced) || blockedForItems(world, faced[0], faced[1], item.lit)) {
        return false;
    }

    if (!placeOnFloor(world, item, faced)) {
        world.fx('bonk', ...tileCentre(faced));

        return true;
    }

    // The put-down beat: committing something to the pile costs a moment.
    player.stunnedUntil = Math.max(player.stunnedUntil, world.now + putDownSeconds(world));

    return true;
}

/** Rule 5: floor item, then shelf, then the broom hook, then a jammed lever. */
function pickUp(world: World, player: PlayerState, sessionId: string, faced: Tile): boolean {
    const item = floorItemAt(world, faced);

    if (item !== null) {
        if (item.lit && !world.level.hazards.litKegCarry) {
            world.fx('bonk', ...tileCentre(faced));

            return true;
        }

        giveToPlayer(world, item, sessionId);

        return true;
    }

    const shelf = shelfAt(world, faced);

    if (shelf !== null) {
        const pulled = shelfPull(world, shelf.station, shelf.side);

        if (pulled !== null) {
            giveToPlayer(world, pulled, sessionId);

            return true;
        }
    }

    if (sameTile(world.layout.props.broomHook, faced) && !broomTaken(world)) {
        player.carrying = 'broom';

        return true;
    }

    const stationId = stationTileAt(world, faced);

    if (stationId === null) return false;

    return beginUnjam(world, player, sessionId, stationId, faced);
}

/**
 * `E` on the floor (contracts §10.4, §11). `false` hands the press on to the
 * station module and then to F10's repair, so every branch that does nothing
 * has to say so rather than swallowing it.
 */
export function onInteract(world: World, player: PlayerState, tMs?: number): boolean {
    const sessionId = world.sessionIdOf(player);

    // An absent `t` means the press is being judged at server receipt time
    // (contracts §4); a client timestamp goes through the offset first.
    const pressMs = tMs === undefined ? world.now * 1000 : world.inputClock(sessionId, tMs) * 1000;

    // Standing on the dock is being at the dock: the module owns every press
    // there but the catch, whatever the player is holding.
    if (player.stationId !== '' && world.stationConfig(player.stationId).joinMode === 'stand') {
        return tryCatch(world, player, sessionId, pressMs);
    }

    if (player.chore !== '') return true;
    if (tryCatch(world, player, sessionId, pressMs)) return true;

    const dir = FACING_DIRS[player.facing];

    if (dir === undefined) return false;

    const here = world.tileOf(player.x, player.y);
    const faced: Tile = [here[0] + dir[0], here[1] + dir[1]];

    if (player.carrying === 'broom') {
        if (!sameTile(world.layout.props.broomHook, faced)) return false;

        player.carrying = '';

        return true;
    }

    if (player.carrying !== '') return putDownItem(world, player, faced);

    return pickUp(world, player, sessionId, faced);
}

/**
 * `Space` on the floor. `tMs` is part of the §10.4 signature; nothing on this
 * path is judged against the clock, so nothing reads it.
 */
export function onAction(world: World, player: PlayerState, tMs: number): boolean {
    const sessionId = world.sessionIdOf(player);

    if (player.chore !== '') return false;
    if (player.carrying === 'broom') return beginSweep(world, player, sessionId);
    if (player.carrying === '') return false;

    return startThrow(world, player, sessionId);
}

/**
 * A disconnect is not an oops: whatever they were holding is set down where
 * they stood, with no drop table, no spill and nothing on anyone's record.
 */
export function releaseCarried(world: World, sessionId: string): void {
    const player = world.state.players.get(sessionId);

    if (player === undefined) return;

    if (player.carrying === 'broom') {
        player.carrying = '';

        return;
    }

    const item = takeCarried(world, sessionId);

    if (item === null) return;

    const tile = world.tileOf(player.x, player.y);

    if (putDown(world, item, tile, sessionId) !== 'blocked') return;

    if (placeNear(world, item, tile)) return;

    world.tally.scrap(item.type as ItemType);
    destroyItem(world, item.id);
}

/** Movement emits these earlier in the same tick (contracts §11). */
function drainBumps(world: World): void {
    for (const bump of itemStore(world).bumps.splice(0)) {
        const mover = world.state.players.get(bump.mover);

        if (mover === undefined || mover.carrying === '' || mover.carrying === 'broom') continue;

        const item = world.state.items.get(mover.carrying);

        if (item === undefined) continue;

        const away: Tile = bump.mover === bump.a ? [bump.dx, bump.dy] : [-bump.dx, -bump.dy];
        // Two bodies exactly on top of each other have no direction to part
        // along, so the item goes wherever the mover was looking.
        const dir = away[0] === 0 && away[1] === 0 ? (FACING_DIRS[mover.facing] ?? away) : away;
        const tile = world.tileOf(mover.x, mover.y);

        dropItem(world, item, tile, dir, bump.mover);
        world.tally.bumpPlayer(mover.userId, 'drops');
        world.fx('bonk', ...tileCentre(tile));
    }
}

function refreshFloorCounts(world: World): void {
    for (const cfg of world.level.stations) {
        const station = world.state.stations.get(cfg.id);

        if (station === undefined) continue;

        let count = 0;

        for (const tile of cfg.floorRing.tiles) count += world.itemsAt(tile[0], tile[1]).length;

        station.floorCount = count;
    }
}

/**
 * The §11 slot after stations and before hazards. Every deadline below is an
 * absolute `clock` second, so `dt` is only the §10.4 signature.
 */
export function tick(world: World, dt: number): void {
    drainBumps(world);
    tickFlights(world);
    tickChores(world);
    refreshFloorCounts(world);
}

export const itemsSystem: System = {
    name: 'items',

    init(world: World): void {
        world.on('bump', (bump) => {
            itemStore(world).bumps.push(bump);
        });
    },

    tick,
};
