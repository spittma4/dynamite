import type { FuseLength, ItemType, JigMg, StationConfig, Tile } from '@shared';

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
 * Which way a shelf tile faces away from its machine: -1 for left, 1 for right.
 * The aisle a player walks is on that side, so it is where the shelf's label
 * and its apron go — and, since F15, which way the hopper standing on the tile
 * opens.
 *
 * Measured against the tiles the crew stands on, which is how
 * `checkFlowDirection` measures the same thing (ADR 0015 rules 1 and 3: an
 * in-tray is left of `workTiles`, an out-tray is right of them). It used to be
 * measured against the middle of the whole footprint, and the footprint
 * contains the shelves and the rack — so on the floor the game shipped with,
 * `assembly-a`'s midpoint sat at 13.5 and its output shelf at x 13 came back
 * -1 along with its input shelf at x 11. Both faces of one machine labelled
 * into the same aisle. The rule the validator now enforces is the rule this
 * reads, so the two cannot disagree about which face a player is standing at.
 */
export function outwardSide(station: StationConfig, tile: Tile): -1 | 1 {
    const workMinX = Math.min(...station.workTiles.map(([x]) => x));

    return tile[0] < workMinX ? -1 : 1;
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
export type JigStall = Pick<JigMg, 'phase' | 'cradle' | 'keg' | 'pour' | 'cradleWants'>;

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
 * The Jig stops three ways (`stationStatus`, `shared/src/sim/jig.ts`) and since N2
 * all three are errands — the bin takes a fuse set like any other material. What
 * each stop is short of is the whole problem: in `parts` the machine has already
 * consumed its keg off the shelf into `state.keg`, so the shelf looks exactly like
 * a keg starve. Reading it as one sends a hauler to fill the eight slots, and a
 * full shelf is what stops `feed()` restocking the casings the machine prints for
 * itself.
 *
 * The order of the branches is the rule, not an accident: the phase says what the
 * machine is holding out for, a full shelf outranks every errand that would be
 * refused at it, and only then is the shelf read for what is missing off it.
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
        return { sentence: needFuse(jig.cradleWants), haul: true, act: true };
    }

    const shelf = station.inputShelf;

    if (!shelf) return null;

    // Nowhere to put anything: `feed()` bails on `shelfRoom <= 0`, so a packed
    // shelf never gets its casing and the Jig stays stopped until somebody lifts
    // one back off. It is read before every errand below, because `shelfPush`
    // refuses a full shelf — naming a haul here walks a hauler into a wordless
    // `bonk`, and the keg starve and the clogged bin are both reachable this way.
    // A fuse set is the one exception and it is handled above: it can still arrive
    // through the air, off B's toss, with the shelf as full as it likes.
    if (shelfTypes.length >= shelf.capacity) {
        return { sentence: handsFull ? SHELF_FULL_HANDS : SHELF_FULL, haul: false, act: true };
    }

    // `stationStatus` starves on `phase === 'pour' && pour === null`, and
    // `startPour` only leaves that behind when there is no keg on the shelf and
    // none in the machine. Without this branch the floor fell through to
    // `copy.stations.needParts` and named an object no player can fetch.
    if (jig !== null && jig.phase === 'pour' && jig.pour === null) {
        return { sentence: NEED_KEG, haul: true, act: true };
    }

    const accepts = shelf.accepts as ItemType[] | undefined;
    // A keg the machine is holding with pours left is stock in hand, exactly as
    // `pourAvailable` counts it — otherwise the sign cries shortage on every
    // other cycle of a healthy line, and a sign that is always on is never read.
    const inMachine = jig?.keg != null && jig.keg.poursLeft > 0 ? 'keg' : '';
    const missing = shelfScan(accepts).find(
        (type) => !shelfTypes.includes(type) && type !== inMachine,
    );

    if (missing) return { sentence: needOne(missing), haul: true, act: true };

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
 * The types whose absence from the shelf is a shortage worth a sentence. A fuse
 * set is not one of them, even though `haulableInputs` lists it since N2: the bin
 * is stock the machine reaches into only during `parts`, so an empty bin at any
 * other moment is not a stop, and the `parts` branch above owns the one moment it
 * is. Scanning it here painted NEED FUSE SETS over a plain casing starve and sent
 * a hauler the length of the floor for a material nothing was waiting on.
 */
function shelfScan(accepts: ItemType[] | undefined): ItemType[] {
    return haulableInputs(accepts).filter((type) => type !== 'parts');
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

/**
 * The fuse the jig is stopped for, named by its length rather than by where to
 * get one. The sentence used to end '— RACK' because the rack was the only
 * source; since N2 the bin takes a set too (`takeFromShelf`), so a sign that
 * names one of the two sources is wrong about the other — and the half it left
 * out is the only one a lone player has.
 *
 * The length is what a fetch can get wrong. `usableSetOnShelf` refuses a set the
 * seated order cannot use, so a LONG set fetched under a SHORT order is a walk
 * for nothing and the machine stays exactly as stopped. `''` is a day with no
 * order, where the machine takes whatever arrives and the sentence says no more
 * than it knows.
 */
function needFuse(wants: FuseLength | undefined): string {
    const need = `NEED A ${FUSE_SET}`;

    return wants ? `${need} — ${wants.toUpperCase()}` : need;
}
