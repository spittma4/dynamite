import { BUBBLE_SECONDS, copy, rollDrop } from '../shared';
import type {
    DropContext,
    DropOutcome,
    ItemState,
    ItemType,
    PlayerState,
    StationType,
    Tile,
} from '../shared';
import { setBubble } from './bubbles';
import { spark } from './hazards';
import {
    addSpill,
    blockedForItems,
    destroyItem,
    floorItemAt,
    placeNear,
    takeCarried,
    tileCentre,
} from './items';
import { jam } from './stations';
import type { World } from './World';

/**
 * The floor's answer to butterfingers (contracts §10.4, docs/17). `rollDrop`
 * decides what happens; this file is the half that writes it down — the puddle,
 * the soot, the dent and the jam. It is the one path a bumped, uncaught or
 * fumbled item ever takes, so an oops looks the same however it started.
 */

/** The dock has no machine: a stick landing on the ramp is in the way, not a jam. */
const JAMMABLE: readonly StationType[] = ['boom_powder', 'assembly'];

/** The keg's dud floor and the damp step from a knock-over (contracts §3). */
const DUD_QUALITY = 0.4;
const KNOCK_OVER_QUALITY_LOSS = 0.3;

function jammableStationAt(world: World, t: Tile): string | null {
    for (const cfg of world.level.stations) {
        if (!JAMMABLE.includes(cfg.type)) continue;

        for (const tile of cfg.workTiles) {
            if (tile[0] === t[0] && tile[1] === t[1]) return cfg.id;
        }
    }

    return null;
}

/** F05 owns the jam itself (contracts §10.2); the shouting is F06's. */
function jamStation(world: World, stationId: string): void {
    const station = world.state.stations.get(stationId);

    if (station === undefined || station.state === 'jammed') return;

    jam(world, stationId);

    world.state.players.forEach((player) => {
        if (player.stationId !== stationId) return;

        setBubble(world, player, copy.bubbles.whoThrewThat, BUBBLE_SECONDS);
    });
}

/** Ties go to the earliest joiner, which is the order `state.players` keeps. */
function nearestPlayer(world: World, t: Tile): PlayerState | null {
    const [cx, cy] = tileCentre(t);
    let best: PlayerState | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    world.state.players.forEach((player) => {
        const distance = Math.hypot(player.x - cx, player.y - cy);

        if (distance >= bestDistance) return;

        bestDistance = distance;
        best = player;
    });

    return best ?? null;
}

function fizzle(world: World, item: ItemState, origin: Tile): void {
    const victim = nearestPlayer(world, origin);

    if (victim !== null) victim.sooted = true;

    world.grooveEvents.fizzles++;
    world.tally.destroyed('stick', 'fizzle');
    destroyItem(world, item.id);
    world.fx('fizzle', ...tileCentre(origin));

    // Never rolled here (contracts §10.4): a fizzle always sparks, and F10 is
    // the one that decides whether the tile had anything to catch.
    spark(world, origin[0], origin[1], 'fizzle');
}

/**
 * Contracts §10.4. Also the station modules' butterfingers hook, so the culprit
 * may be a player or the machine itself; either way the item leaves their grip
 * before the table is rolled.
 */
export function dropItem(
    world: World,
    item: ItemState,
    origin: Tile,
    dir: Tile,
    culpritId: string,
): DropOutcome {
    if (item.holder === culpritId) takeCarried(world, culpritId);

    const ctx: DropContext = {
        blocked: (t) => blockedForItems(world, t[0], t[1], item.lit),
        occupied: (t) => {
            const sitting = floorItemAt(world, t);

            return world.playersAt(t[0], t[1]).length > 0 || (sitting !== null && sitting !== item);
        },
        workTileOwner: (t) => jammableStationAt(world, t),
    };

    const outcome = rollDrop(item.type as ItemType, origin, dir, ctx, () => world.rng.next(), {
        stickFizzleChance: world.level.carry.drop.stickFizzleChance,
        kegKnockOverOnHit: world.level.carry.drop.kegKnockOverOnHit,
    });

    if (outcome.kind === 'stick' && outcome.fizzle) {
        fizzle(world, item, origin);

        return outcome;
    }

    if (outcome.kind === 'stick') item.dents += 1;

    const knockedOver = outcome.kind === 'keg' && outcome.knockedOver;

    if (knockedOver) {
        addSpill(world, outcome.restTile);
        item.quality = Math.max(DUD_QUALITY, item.quality - KNOCK_OVER_QUALITY_LOSS);
        item.prime = false;
    }

    // Two floor items never share a tile, so a crowded rest tile pushes the item
    // outwards; nothing free within two tiles and it is gone.
    if (!placeNear(world, item, outcome.restTile)) {
        world.tally.scrap(item.type as ItemType);
        destroyItem(world, item.id);
        world.fx('pfft', ...tileCentre(outcome.restTile));

        return outcome;
    }

    // A lit keg that came down in a blast bin was taken by F10 as it landed
    // (contracts §10.5), so there is nothing left here to bounce or to jam.
    if (!world.state.items.has(item.id)) return outcome;

    world.fx(knockedOver ? 'pfft' : 'thunk', ...tileCentre([item.x, item.y]));

    const restedWhereItFell = item.x === outcome.restTile[0] && item.y === outcome.restTile[1];

    if (outcome.jamStationId !== null && restedWhereItFell) jamStation(world, outcome.jamStationId);

    return outcome;
}
