import type { ItemType, JigMg, StationConfig, Tile } from '@shared';

import { NEED_KEG, SHELF_FULL, SHELF_FULL_HANDS } from '../minigames/Jig';
import { FUSE_SET } from '../nouns';
import { SELF_STOCKED, haulableInputs, pluralOf } from './dropTargets';

/**
 * The intake zone (F05 §Client): where a hauler stands to put a thing down,
 * and what a starved machine is actually short of. Pure geometry and words —
 * `render/Stations.ts` paints them.
 *
 * A playtester with six kegs waiting on Boom Powder's out tray read Assembly's
 * "NEED PARTS" and went looking for casings. Every sentence a starved machine
 * can say is written here, so every one of them can be tested without a canvas.
 */

/**
 * The station's own x extent. This is the horizontal half of the bbox that
 * `footprintOf` in `shared/src/sim/stations.ts` builds — that bbox spans the
 * station's named tiles and nothing from the layout, so the two agree.
 */
function xSpan(station: StationConfig): { x0: number; x1: number } {
    const xs = [station.anchor[0]];

    for (const [x] of [...station.workTiles, ...station.rackTiles]) xs.push(x);

    if (station.inputShelf) xs.push(station.inputShelf.tile[0]);
    if (station.outputShelf) xs.push(station.outputShelf.tile[0]);

    return { x0: Math.min(...xs), x1: Math.max(...xs) };
}

/**
 * Which way a shelf tile faces away from its machine: -1 for left, 1 for right.
 * The aisle a player walks is on that side, so it is where the shelf's label
 * and its apron go.
 */
export function outwardSide(station: StationConfig, tile: Tile): -1 | 1 {
    const { x0, x1 } = xSpan(station);

    return tile[0] <= (x0 + x1) / 2 ? -1 : 1;
}

/**
 * The tiles that make up a station's drop zone: the input shelf and the floor
 * tile you stand on to reach it. A single shelf tile is a grey box among grey
 * boxes; two tiles wide, striped, it reads as somewhere to put a thing down.
 * The dock has no shelf, so its ramp lanes are the zone. `null` means this
 * station is not somewhere anybody brings anything.
 */
export function apron(station: StationConfig): Tile[] | null {
    if (station.type === 'dock') {
        return station.workTiles.length > 0 ? [...station.workTiles] : null;
    }

    const shelf = station.inputShelf;

    if (!shelf) return null;

    const [x, y] = shelf.tile;

    return [
        [x, y],
        [x + outwardSide(station, shelf.tile), y],
    ];
}

/**
 * The part of a Jig's `mg` blob a floor sign has to read. `keg` and `pour` are
 * in it because the shelf alone lies about powder: `startPour` consumes the keg
 * off the shelf into `state.keg` on the first pour, and every shipped level
 * pours two sticks from one keg — so between them the machine is stocked and
 * the shelf is bare. The sim's own test is `pourAvailable` and this mirrors it.
 */
export type JigStall = Pick<JigMg, 'phase' | 'cradle' | 'keg' | 'pour'>;

export interface Shortage {
    /** What the station says out loud. */
    sentence: string;
    /** Whether the answer is to carry something into the striped zone. */
    haul: boolean;
    /**
     * Whether anybody can do something about it, or it is only a wait. A wait
     * is not worth a plea for hands; an errand is worth more than one.
     */
    act: boolean;
}

/**
 * What a starved station is short of, and whether its intake zone is the way to
 * fix it. `null` means the client cannot name the shortage and the caller falls
 * back to `copy.needParts`.
 *
 * The Jig stops three ways (`stationStatus`, `shared/src/sim/jig.ts`) and only
 * two of them are errands. In `parts` it is waiting on a fuse set from the rack
 * — and it has already consumed its keg off the shelf into `state.keg`, so the
 * shelf looks exactly like a keg starve. Reading it as one sends a hauler to
 * fill the eight slots, and a full shelf is what stops `feed()` restocking the
 * casings the machine prints for itself.
 *
 * Every sentence is the one the panel of the person standing there already
 * says. Two grammars for one fact — 'NEED KEGS' on the floor over 'NEED A KEG'
 * on the panel — were on screen together in any session with three players.
 */
export function shortageOf(
    station: StationConfig,
    shelfTypes: ItemType[],
    jig: JigStall | null,
    handsFull = false,
): Shortage | null {
    if (jig !== null && jig.phase === 'parts' && jig.cradle === 'empty') {
        return { sentence: `NEED A ${FUSE_SET} — RACK`, haul: false, act: true };
    }

    // `stationStatus` starves on `phase === 'pour' && pour === null`, and
    // `startPour` only leaves that behind when there is no keg on the shelf and
    // none in the machine. Without this branch the floor fell through to
    // `copy.stations.needParts` and named an object no player can fetch.
    if (jig !== null && jig.phase === 'pour' && jig.pour === null) {
        return { sentence: NEED_KEG, haul: true, act: true };
    }

    const shelf = station.inputShelf;

    if (!shelf) return null;

    const accepts = shelf.accepts as ItemType[] | undefined;
    // A keg the machine is holding with pours left is stock in hand, exactly as
    // `pourAvailable` counts it — otherwise the sign cries shortage on every
    // other cycle of a healthy line, and a sign that is always on is never read.
    const inMachine = jig?.keg != null && jig.keg.poursLeft > 0 ? 'keg' : '';
    const missing = haulableInputs(accepts).find(
        (type) => !shelfTypes.includes(type) && type !== inMachine,
    );

    if (missing) return { sentence: needOne(missing), haul: true, act: true };

    // Nothing to fetch and nowhere to put it: `feed()` bails on `shelfRoom <= 0`,
    // so a shelf packed with kegs never gets its casing and the Jig stays stopped
    // until somebody lifts one back off.
    if (shelfTypes.length >= shelf.capacity) {
        return { sentence: handsFull ? SHELF_FULL_HANDS : SHELF_FULL, haul: false, act: true };
    }

    // Out of the thing the machine stocks for itself, with room to stock it: the
    // answer is to wait a tick, so the sentence says so rather than naming an
    // errand nobody can run.
    const restocking = accepts?.find(
        (type) => SELF_STOCKED.includes(type) && !shelfTypes.includes(type),
    );

    if (restocking) return { sentence: `${pluralOf(restocking)} COMING`, haul: false, act: false };

    return null;
}

/**
 * The request for a single unit, which is what a shortage always is: one keg
 * unsticks the machine. `pluralOf` stays for the shelf signs, where a stock
 * list is what is wanted — 'NEED KEGS' read as a standing order to keep
 * hauling, which is how a shelf reaches its cap and jams the restock.
 */
function needOne(type: ItemType): string {
    return type === 'keg' ? NEED_KEG : `NEED ${pluralOf(type)}`;
}
