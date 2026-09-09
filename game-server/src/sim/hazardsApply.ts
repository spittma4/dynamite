import { LEVEL_DEFAULTS, explosionAction, nearestUndamagedStation, unpackTile } from '../shared';
import type {
    Banner,
    BlastResult,
    ChainTier,
    Fuse,
    HazardsConfig,
    ItemType,
    PlayerState,
    Tile,
} from '../shared';
import { destroyItem, removeSpill, tileCentre } from './items';
import { leave, unjam } from './stations';
import type { World } from './World';

/**
 * The writing-down half of F10 (contracts §10.5). `hazards.ts` decides what
 * happened; everything that touches the schema, another feature's module or the
 * outbox happens here, so the decision and the damage can be read apart.
 */

/** The four banners F10 raises, and so the only four it is allowed to take down. */
const OWN_BANNERS: ReadonlySet<string> = new Set<Banner>([
    'WHOOPS',
    'INCIDENT',
    'EXPLODED',
    'NICE SAVE',
]);

export interface HazardHooks {
    /** Puts a chained fuse into the private table and lights its keg. */
    lightFuse(fuse: Fuse): void;
    /** Ends the stomp or repair a knockback just interrupted. */
    cancelChore(sessionId: string): void;
}

function hazards(world: World): HazardsConfig {
    return world.level.hazards;
}

export function bannerSecondsOf(world: World): number {
    return hazards(world).bannerSeconds ?? LEVEL_DEFAULTS.hazards.bannerSeconds;
}

export function repairSecondsOf(world: World): number {
    return hazards(world).repairSeconds ?? LEVEL_DEFAULTS.hazards.repairSeconds;
}

export function setBanner(world: World, banner: Banner): void {
    world.state.banner = banner;
    world.state.bannerUntil = world.now + bannerSecondsOf(world);
}

/** Another feature's banner outlives its own clock; only ours is ever cleared. */
export function clearBanner(world: World): void {
    const { state } = world;

    if (!OWN_BANNERS.has(state.banner)) return;

    state.banner = '';
    state.bannerUntil = 0;
}

export function clearExpiredBanner(world: World): void {
    if (world.now < world.state.bannerUntil) return;

    clearBanner(world);
}

/** The soot is counted once a shift, not once a blast. */
export function soot(world: World, player: PlayerState): void {
    if (player.sooted) return;

    player.sooted = true;
    world.tally.bumpPlayer(player.userId, 'sooted');
}

function scorch(world: World, tile: number): void {
    removeSpill(world, unpackTile(tile, world.state.width));

    if (world.state.scorchTiles.includes(tile)) return;

    world.state.scorchTiles.push(tile);
}

/**
 * Two tiles clear, stunned and filthy — but still holding whatever they were
 * holding. A forced drop would put fuel on the floor that nobody chose to put
 * there, and the pile is supposed to be the players' own doing (docs/02).
 */
function knockBack(world: World, hooks: HazardHooks, sessionId: string, tile: Tile): void {
    const player = world.state.players.get(sessionId);

    if (player === undefined) return;

    [player.x, player.y] = tileCentre(tile);
    player.stunnedUntil = Math.max(player.stunnedUntil, world.now + hazards(world).stunSeconds);
    soot(world, player);
    hooks.cancelChore(sessionId);

    if (player.stationId !== '') leave(world, player);
}

export function applyBlast(world: World, hooks: HazardHooks, result: BlastResult): void {
    let knocked = false;

    for (const effect of result.effects) {
        if (effect.kind === 'destroyItem') destroyItem(world, effect.itemId);
        if (effect.kind === 'lightFuse') hooks.lightFuse(effect.fuse);
        if (effect.kind === 'scorch') scorch(world, effect.tile);

        if (effect.kind === 'knockback') {
            knockBack(world, hooks, effect.sessionId, [effect.x, effect.y]);
            knocked = true;
        }
    }

    if (knocked) world.reindexPlayers();

    world.fx('blast', ...tileCentre(result.origin), { size: 1 });
    world.grooveEvents.blastKegs += result.kegs;

    if (result.kegs > 0) world.tally.destroyed('keg', 'blast');
}

/**
 * The machine is off until someone files the paperwork: no cycle, no shelves,
 * nobody on it. F05 owns the jam bookkeeping, so a jammed machine is unjammed
 * by its owner before F10 relabels it.
 */
export function damageStation(world: World, stationId: string): void {
    const station = world.state.stations.get(stationId);

    if (station === undefined || station.state === 'damaged') return;

    if (station.state === 'jammed') unjam(world, stationId);

    station.state = 'damaged';
    station.progress = 0;

    // Paperwork does not tidy the pile away. A keg is fuel wherever it stands,
    // and docs/16's nine-on-the-ring-plus-six-on-the-shelf only reaches the
    // factory explosion if an incident half way through a chain leaves the
    // shelf beside it burning. Everything else is scrapped, and billed as the
    // waste it is so blowing a shelf up is never cheaper than keeping it — as
    // scrap, never as a destruction, because nothing here exploded or fizzled.
    for (const itemId of [...station.inputShelf, ...station.outputShelf]) {
        const item = world.state.items.get(itemId);

        if (item === undefined || item.type === 'keg') continue;

        world.tally.scrap(item.type as ItemType);
        destroyItem(world, itemId);
    }

    const workers: PlayerState[] = [];

    world.state.players.forEach((player) => {
        if (player.stationId === stationId) workers.push(player);
    });

    for (const worker of workers) leave(world, worker);

    world.fx('blast', ...tileCentre(world.stationConfig(stationId).anchor), { size: 1 });
}

export function repairStation(world: World, stationId: string): void {
    const station = world.state.stations.get(stationId);

    if (station === undefined || station.state !== 'damaged') return;

    station.state = 'idle';
    station.progress = 0;
    world.fx('chime', ...tileCentre(world.stationConfig(stationId).anchor));
}

function damageEveryStation(world: World): void {
    const ids: string[] = [];

    world.state.stations.forEach((station) => ids.push(station.id));

    for (const id of ids) damageStation(world, id);
}

/**
 * One tier per chain (contracts §10.5). The day only ever ends here through
 * `requestEnd`: F03 owns the phase, and a level that treats an explosion as a
 * setback keeps playing on a floor where every machine is now paperwork.
 */
export function applyEscalation(world: World, tier: ChainTier, origin: Tile): void {
    if (tier === 'whoops') {
        setBanner(world, 'WHOOPS');

        return;
    }

    // One bump per escalation, not per machine (contracts §10.5): the grade
    // weighs an incident at −5, and a setback that damages three stations is
    // still one thing that happened.
    if (tier === 'incident') {
        setBanner(world, 'INCIDENT');
        world.tally.bump('incidents');

        const stations: Array<{ id: string; anchorX: number; anchorY: number; state: string }> = [];

        world.state.stations.forEach((station) => {
            stations.push({
                id: station.id,
                anchorX: station.anchorX,
                anchorY: station.anchorY,
                state: station.state,
            });
        });

        const nearest = nearestUndamagedStation(stations, origin[0], origin[1]);

        if (nearest !== null) damageStation(world, nearest);

        return;
    }

    if (tier !== 'exploded') return;

    setBanner(world, 'EXPLODED');
    world.fx('blast', ...tileCentre(origin), { size: 3 });

    if (explosionAction(hazards(world)) === 'setback') {
        world.tally.bump('incidents');
        damageEveryStation(world);

        return;
    }

    world.state.players.forEach((player) => soot(world, player));
    world.requestEnd('exploded', 'exploded');
}
