import {
    FuseState,
    advanceChain,
    buildFuelMap,
    choreStatus,
    copy,
    dangerBeacon,
    expiredFuses,
    fuseOnTile,
    inBounds,
    isBlastBin,
    lightFromSpark,
    pickRingSparkTile,
    resolveBlast,
    ringFuel,
    unpackTile,
} from '../shared';
import type {
    Beacon,
    BlastPlayer,
    BlastView,
    Chain,
    Fuse,
    FuelItem,
    FuelMap,
    FuelView,
    HazardChore,
    HazardsConfig,
    ItemType,
    PlayerState,
    ShelfSide,
    SparkCause,
    Tile,
} from '../shared';
import {
    applyBlast,
    applyEscalation,
    clearBanner,
    clearExpiredBanner,
    repairSecondsOf,
    repairStation,
    setBanner,
} from './hazardsApply';
import type { HazardHooks } from './hazardsApply';
import { destroyItem, tileCentre } from './items';
import { setSparkHook } from './minigames/slammer';
import type { System, World } from './World';

/**
 * Hazards on the server (contracts §10.5, docs/16). The private fuse table is
 * the source of truth and `FactoryState.fuses` is its mirror, because a fuse
 * has to keep burning while its keg is picked up, thrown and put down again,
 * and only one of those two ever knows where the keg currently is.
 */

export type SparkResult = 'lit' | 'already' | 'noFuel' | 'inactive';

/** `lastHolder` is who gets the NICE SAVE: a landing carries no thrower. */
type LiveFuse = Fuse & { lastHolder: string };

interface HazardsState {
    fuses: Map<string, LiveFuse>;
    chores: Map<string, HazardChore>;
    /** Seconds a station has been jammed without a break, per station id. */
    jamSeconds: Map<string, number>;
    chain: Chain | null;
    walls: Set<number>;
}

const stores = new WeakMap<World, HazardsState>();

/** The accumulator fires on the boundary rather than the tick after it. */
const EPSILON = 1e-9;

const JAM_ROLL_SECONDS = 10;

function store(world: World): HazardsState {
    let found = stores.get(world);

    if (found === undefined) {
        found = {
            fuses: new Map(),
            chores: new Map(),
            jamSeconds: new Map(),
            chain: null,
            walls: new Set(world.layout.walls),
        };
        stores.set(world, found);
    }

    return found;
}

function hazards(world: World): HazardsConfig {
    return world.level.hazards;
}

function shelfTileOf(world: World): FuelView['shelfTileOf'] {
    return (stationId, shelf) => {
        const cfg = world.stations.get(stationId)?.cfg;

        return (shelf === 'in' ? cfg?.inputShelf?.tile : cfg?.outputShelf?.tile) ?? undefined;
    };
}

function fuelMapOf(world: World): FuelMap {
    const items: FuelItem[] = [];

    world.state.items.forEach((item) => {
        items.push({
            id: item.id,
            type: item.type as ItemType,
            x: item.x,
            y: item.y,
            holder: item.holder,
            shelf: item.shelf as ShelfSide,
            inFlight: item.inFlight,
        });
    });

    return buildFuelMap({
        width: world.state.width,
        items,
        spillTiles: [...world.state.spillTiles],
        shelfTileOf: shelfTileOf(world),
    });
}

function setLit(world: World, itemId: string, lit: boolean): void {
    const item = world.state.items.get(itemId);

    if (item !== undefined) item.lit = lit;
}

/**
 * Rewritten every tick rather than diffed: F11 counts `state.fuses.size` as the
 * Groove drain, so a mirror that lags by a tick would bill the players for a
 * fuse they already stomped.
 */
function mirrorFuses(world: World): void {
    const { fuses } = store(world);
    const rows = world.state.fuses;
    const stale: string[] = [];

    for (const [key, fuse] of fuses) {
        let row = rows.get(key);

        if (row === undefined) {
            row = new FuseState();
            rows.set(key, row);
        }

        row.itemId = fuse.itemId;
        row.x = fuse.x;
        row.y = fuse.y;
        row.secondsLeft = Math.max(0, fuse.expiresAt - world.now);
        row.chain = fuse.chain;
    }

    rows.forEach((_row, key) => {
        if (!fuses.has(key)) stale.push(key);
    });

    for (const key of stale) rows.delete(key);
}

function removeFuse(world: World, key: string): void {
    store(world).fuses.delete(key);
    world.state.fuses.delete(key);
}

function ignite(world: World, map: FuelMap, x: number, y: number, cause: SparkCause): SparkResult {
    const { fuses } = store(world);

    if (fuseOnTile(fuses, x, y) !== null) return 'already';

    const cfg = hazards(world);
    const fuse = inBounds(x, y, world.state.width, world.state.height)
        ? lightFromSpark(map, x, y, world.state.width, world.now, cfg, fuses)
        : null;

    // A spark with nothing to catch is still shown: the players have to learn
    // that the act sparks, not only that the pile burns.
    if (fuse === null) {
        world.fx('spark', ...tileCentre([x, y]));

        return 'noFuel';
    }

    fuses.set(fuse.key, { ...fuse, lastHolder: '' });

    if (fuse.itemId !== '') setLit(world, fuse.itemId, true);

    mirrorFuses(world);
    world.fx('fuse', ...tileCentre([x, y]));
    world.toast('all', copy.hazards.sparks[cause], 'warn');

    return 'lit';
}

/** The caller has already rolled `hazards.sparks.<cause>`; this only lights it. */
export function spark(world: World, x: number, y: number, cause: SparkCause): SparkResult {
    if (world.state.phase !== 'running') return 'inactive';

    return ignite(world, fuelMapOf(world), x, y, cause);
}

export function sparkRing(world: World, stationId: string, cause: SparkCause): SparkResult {
    if (world.state.phase !== 'running') return 'inactive';

    const station = world.stations.get(stationId);

    if (station === undefined) return 'noFuel';

    const width = world.state.width;
    const map = fuelMapOf(world);
    const ring = station.ring.map((packed) => unpackTile(packed, width));
    const tile = pickRingSparkTile(map, ring, station.cfg.anchor, width, hazards(world).fuel);

    if (tile === null) return 'noFuel';

    return ignite(world, map, tile[0], tile[1], cause);
}

/** Where a burning keg is right now — it rides along with whoever picked it up. */
function fuseTile(world: World, fuse: Fuse): Tile | null {
    if (fuse.itemId === '') {
        return world.isSpill(fuse.x, fuse.y) ? [fuse.x, fuse.y] : null;
    }

    const item = world.state.items.get(fuse.itemId);

    if (item === undefined) return null;

    const holder = world.state.players.get(item.holder);

    if (holder !== undefined) return world.tileOf(holder.x, holder.y);

    if (item.shelf !== '') {
        const cfg = world.stations.get(item.holder)?.cfg;
        const tile = item.shelf === 'in' ? cfg?.inputShelf?.tile : cfg?.outputShelf?.tile;

        return tile ?? null;
    }

    return world.tileOf(item.x, item.y);
}

/**
 * A fuse whose keg was consumed by a station or whose puddle was swept goes out
 * without a sound — nobody put it out, so nobody is credited for it.
 */
function trackFuses(world: World): void {
    const { fuses } = store(world);

    for (const [key, fuse] of [...fuses]) {
        const tile = fuseTile(world, fuse);

        if (tile === null) {
            removeFuse(world, key);

            continue;
        }

        fuse.x = tile[0];
        fuse.y = tile[1];

        const item = fuse.itemId === '' ? undefined : world.state.items.get(fuse.itemId);

        if (item !== undefined && world.state.players.has(item.holder)) {
            fuse.lastHolder = item.holder;
        }
    }
}

/**
 * The one die F10 rolls itself (contracts §10.5): a machine left jammed keeps
 * throwing sparks at its own floor ring, so walking away from a jam is the
 * decision that lights the pile.
 */
function tickJamSparks(world: World, dt: number): void {
    const { jamSeconds } = store(world);
    const chance = hazards(world).sparks.jammedPer10s;

    for (const [id, station] of world.stations) {
        if (station.st.state !== 'jammed') {
            jamSeconds.delete(id);

            continue;
        }

        const before = jamSeconds.get(id) ?? 0;
        const after = before + dt;

        jamSeconds.set(id, after);

        const crossed =
            Math.floor((after + EPSILON) / JAM_ROLL_SECONDS) >
            Math.floor((before + EPSILON) / JAM_ROLL_SECONDS);

        if (crossed && world.rng.next() < chance) sparkRing(world, id, 'jammed');
    }
}

function clearChore(world: World, sessionId: string, player: PlayerState | undefined): void {
    store(world).chores.delete(sessionId);

    if (player === undefined) return;

    player.chore = '';
    player.choreUntil = 0;
}

function finishRepair(world: World, stationId: string): void {
    const { chores } = store(world);

    repairStation(world, stationId);

    for (const [sessionId, chore] of [...chores]) {
        if (chore.kind !== 'repair' || chore.target !== stationId) continue;

        clearChore(world, sessionId, world.state.players.get(sessionId));
    }
}

function finishStomp(world: World, chore: HazardChore, player: PlayerState): void {
    const fuse = store(world).fuses.get(chore.target);

    if (fuse !== undefined && fuse.itemId !== '') setLit(world, fuse.itemId, false);

    removeFuse(world, chore.target);
    world.fx('pfft', ...tileCentre(chore.tile));
    world.tally.bumpPlayer(player.userId, 'fusesStomped');
}

function tickChores(world: World): void {
    const { chores } = store(world);

    for (const [sessionId, chore] of [...chores]) {
        // The repair that finished a moment ago took its fellow repairers with it.
        if (!chores.has(sessionId)) continue;

        const player = world.state.players.get(sessionId);

        // A body F06 took back for a sweep or an unjam is no longer ours to run.
        if (player === undefined || player.chore !== chore.kind) {
            chores.delete(sessionId);

            continue;
        }

        const status = choreStatus(chore, player, world.now, targetOk(world, chore));

        if (status === 'running') continue;

        // A finished repair ends every hold on that machine, this one included.
        if (status === 'done' && chore.kind === 'repair') {
            finishRepair(world, chore.target);

            continue;
        }

        if (status === 'done') finishStomp(world, chore, player);

        clearChore(world, sessionId, player);
    }
}

/** A stomp needs its fuse where it was; a repair needs the machine still broken. */
function targetOk(world: World, chore: HazardChore): boolean {
    if (chore.kind === 'repair') {
        return world.state.stations.get(chore.target)?.state === 'damaged';
    }

    const fuse = store(world).fuses.get(chore.target);

    return fuse !== undefined && fuse.x === chore.tile[0] && fuse.y === chore.tile[1];
}

/**
 * The bar on a damaged machine is the best hold running on it, so two players
 * filing the same report do not fill it twice as fast — they just cover for
 * each other if one of them wanders off.
 */
function tickRepairProgress(world: World): void {
    const seconds = repairSecondsOf(world);
    const best = new Map<string, number>();

    for (const chore of store(world).chores.values()) {
        if (chore.kind !== 'repair') continue;

        const done = Math.min(1, Math.max(0, 1 - (chore.until - world.now) / seconds));

        best.set(chore.target, Math.max(best.get(chore.target) ?? 0, done));
    }

    world.state.stations.forEach((station) => {
        if (station.state === 'damaged') station.progress = best.get(station.id) ?? 0;
    });
}

/**
 * `Space` on a burning tile. The refusals return `false` so the §11 `action`
 * chain can carry the press on to the station overlay behind it.
 */
export function tryBeginStomp(world: World, sessionId: string): boolean {
    const player = world.state.players.get(sessionId);

    if (player === undefined || player.carrying !== '' || player.chore !== '') return false;

    const [tx, ty] = world.tileOf(player.x, player.y);
    const fuse = fuseOnTile(store(world).fuses, tx, ty);

    if (fuse === null) return false;

    player.chore = 'stomp';
    player.choreUntil = world.now + hazards(world).stompSeconds;
    store(world).chores.set(sessionId, {
        sessionId,
        kind: 'stomp',
        target: fuse.key,
        tile: [tx, ty],
        until: player.choreUntil,
    });

    return true;
}

/**
 * The §11 `interact` tail asks for a station id, and only a broken machine
 * underfoot answers: an intact one has already had its say through F05.
 */
export function damagedStationUnder(world: World, player: PlayerState): string {
    const [tx, ty] = world.tileOf(player.x, player.y);

    for (const cfg of world.level.stations) {
        if (world.state.stations.get(cfg.id)?.state !== 'damaged') continue;
        if (cfg.workTiles.some(([x, y]) => x === tx && y === ty)) return cfg.id;
    }

    return '';
}

/**
 * `E` on the work tile of a machine that is on fire. It toggles, because the
 * server never sees the key come up: the second press is how a player says they
 * are done standing there.
 */
export function tryBeginRepair(world: World, sessionId: string, stationId: string): boolean {
    const player = world.state.players.get(sessionId);
    const station = world.state.stations.get(stationId);

    if (player === undefined || station === undefined || station.state !== 'damaged') return false;

    const { chores } = store(world);
    const running = chores.get(sessionId);

    if (running?.kind === 'repair' && running.target === stationId) {
        clearChore(world, sessionId, player);

        return false;
    }

    if (player.carrying !== '' || player.chore !== '') return false;

    const tile = world.tileOf(player.x, player.y);
    const onTheJob = world
        .stationConfig(stationId)
        .workTiles.some(([tx, ty]) => tx === tile[0] && ty === tile[1]);

    if (!onTheJob) return false;

    player.chore = 'repair';
    player.choreUntil = world.now + repairSecondsOf(world);
    chores.set(sessionId, {
        sessionId,
        kind: 'repair',
        target: stationId,
        tile,
        until: player.choreUntil,
    });

    return true;
}

/**
 * F06 calls this the moment a thrown or put-down item comes to rest. Only a
 * burning keg over a bin of sand is interesting: the bin deliberately refuses
 * to swallow an unlit one, or dumping the surplus would become a disposal path.
 */
export function onItemLanded(world: World, itemId: string, x: number, y: number): 'saved' | 'landed' {
    if (world.state.phase !== 'running') return 'landed';

    const item = world.state.items.get(itemId);

    if (item === undefined || !item.lit) return 'landed';
    if (!isBlastBin(world.layout.blastBins, x, y)) return 'landed';

    const fuse = store(world).fuses.get(itemId);

    if (fuse !== undefined) {
        removeFuse(world, itemId);

        const saviour = world.state.players.get(fuse.lastHolder);

        if (saviour !== undefined) world.tally.bumpPlayer(saviour.userId, 'niceSaves');
    }

    // The sand ate a keg the factory bought and will never sell, so the day is
    // billed for it; what the save earns is the blast that never happened.
    world.tally.scrap(item.type as ItemType);
    destroyItem(world, itemId);
    world.fx('whump', ...tileCentre([x, y]));
    world.grooveEvents.niceSaves++;
    setBanner(world, 'NICE SAVE');

    return 'saved';
}

function blastViewOf(world: World): BlastView {
    const items: FuelItem[] = [];
    const players: BlastPlayer[] = [];

    world.state.items.forEach((item) => {
        items.push({
            id: item.id,
            type: item.type as ItemType,
            x: item.x,
            y: item.y,
            holder: item.holder,
            shelf: item.shelf as ShelfSide,
            inFlight: item.inFlight,
        });
    });

    world.state.players.forEach((player, sessionId) => {
        players.push({ id: sessionId, x: player.x, y: player.y, facing: player.facing });
    });

    return {
        width: world.state.width,
        height: world.state.height,
        items,
        spillTiles: [...world.state.spillTiles],
        shelfTileOf: shelfTileOf(world),
        walls: store(world).walls,
        players,
    };
}

function hooksFor(world: World): HazardHooks {
    return {
        lightFuse: (fuse) => {
            const { fuses } = store(world);

            fuses.set(fuse.key, { ...fuse, lastHolder: fuses.get(fuse.key)?.lastHolder ?? '' });

            if (fuse.itemId !== '') setLit(world, fuse.itemId, true);
        },
        cancelChore: (sessionId) => {
            clearChore(world, sessionId, world.state.players.get(sessionId));
        },
    };
}

/**
 * Six seconds are up. Each blast is resolved against the floor as it stands
 * after the one before it, so a chain really is the pile taking itself apart
 * rather than a single snapshot fanning out.
 */
function tickBlasts(world: World): void {
    const state = store(world);
    const cfg = hazards(world);

    for (const key of expiredFuses(state.fuses, world.now)) {
        if (world.endRequested !== null) break;

        const fuse = state.fuses.get(key);

        if (fuse === undefined) continue;

        const tile = fuseTile(world, fuse);

        // The keg was eaten or the puddle swept while the list was being walked.
        if (tile === null) {
            removeFuse(world, key);

            continue;
        }

        fuse.x = tile[0];
        fuse.y = tile[1];
        removeFuse(world, key);

        const result = resolveBlast(blastViewOf(world), fuse, state.fuses, world.now, cfg);

        applyBlast(world, hooksFor(world), result);

        const step = advanceChain(state.chain, world.now, result.kegs, cfg);

        state.chain = step.chain;

        if (step.escalation !== 'none') applyEscalation(world, step.escalation, result.origin);
    }
}

/** Red is the pile's warning, so it is recomputed from the pile every tick. */
function tickBeacons(world: World): void {
    const cfg = hazards(world);
    const width = world.state.width;
    const map = fuelMapOf(world);

    for (const station of world.stations.values()) {
        if (station.ring.length === 0) continue;

        const ring = station.ring.map((packed) => unpackTile(packed, width));

        station.st.beacon = dangerBeacon(
            station.st.beacon as Beacon,
            ringFuel(map, ring, width, cfg.fuel),
            cfg,
        );
    }
}

export function tickHazards(world: World, dt: number): void {
    trackFuses(world);
    tickJamSparks(world, dt);
    tickChores(world);
    tickBlasts(world);
    tickRepairProgress(world);
    tickBeacons(world);
    clearExpiredBanner(world);
    mirrorFuses(world);
}

export function resetHazards(world: World): void {
    const state = store(world);

    for (const key of [...state.fuses.keys()]) removeFuse(world, key);

    for (const sessionId of [...state.chores.keys()]) {
        clearChore(world, sessionId, world.state.players.get(sessionId));
    }

    state.jamSeconds.clear();
    state.chain = null;
    world.state.scorchTiles.splice(0, world.state.scorchTiles.length);
    world.state.items.forEach((item) => {
        item.lit = false;
    });

    world.state.players.forEach((player) => {
        player.sooted = false;

        if (player.chore === 'stomp' || player.chore === 'repair') {
            player.chore = '';
            player.choreUntil = 0;
        }
    });

    world.state.stations.forEach((station) => {
        if (station.state === 'damaged') {
            station.state = 'idle';
            station.progress = 0;
        }

        if (station.beacon === 'red') station.beacon = 'off';
    });

    clearBanner(world);
}

export const hazardsSystem: System = {
    name: 'hazards',
    onStart: resetHazards,
    tick: tickHazards,
};

/**
 * F07 sparks its ring through a seam because F10 did not exist when the Slammer
 * was built. Wiring it from this side keeps `minigames/slammer.ts` in its
 * owner's hands, and `systems.ts` imports this module, so the hook is installed
 * before any room builds a world.
 */
setSparkHook(sparkRing);
