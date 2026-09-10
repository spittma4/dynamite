import { TILE_PX, type FuseLength, type Tile, fill } from '@shared';

import { NOTHING_ON_THE_BOARD } from '../nouns';
import { BOARD_COLOURS } from './palette';

/**
 * The fuse rack (F15 §3): two bins and one sentence, read by the world tile in
 * `render/Stations.ts` and by the B panel in `minigames/Jig.ts`, so the floor
 * and the overlay cannot disagree about which bin the order wants.
 *
 * The playtest line was "the fuse generation is a bit non-intuitive". The pick
 * itself is not invisible — B's panel has drawn the two lengths as buttons with
 * the chosen one filled since F08 — but nothing ever connected the lit button
 * to the order chip two rows above it. `reconcileRoles` sets
 * `state.bPick = view.orders[0]?.fuseLength` (`shared/src/sim/jig.ts:575`) the
 * moment a body takes the rack tile, so the answer is already correct and
 * already made; drawn as a plain highlight it reads as a default the player is
 * being tested on rather than a choice that has been taken off their hands.
 *
 * So the bin the *order* wants is marked separately from the bin the *pick* is
 * on. When they are the same bin — which is every first-time B — the caption
 * says so out loud, which teaches the mechanic and dismisses it in one line.
 */

export type PickedFuse = Exclude<FuseLength, ''>;

export interface RackBox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export interface RackBin {
    fuse: PickedFuse;
    label: string;
    box: RackBox;
    /** `bPick`: the length B's next fetch will pull. */
    picked: boolean;
    /** What the order on the board asks for. */
    wanted: boolean;
    /** Wanted, and the pick is on the other bin — the only amber state here. */
    warn: boolean;
    /** How much fuse hangs off the spool: the two lengths as a silhouette. */
    tail: number;
}

export type RackTone = 'set' | 'warn' | 'idle';

export interface RackCaption {
    text: string;
    tone: RackTone;
}

/**
 * The two sentences the rack can say, as templates rendered through `fill()`.
 * They live here rather than in `config/game/copy.json` because F15 leaves that
 * question open (its own Risks section says these move into this file if
 * contracts §14 rules the other way) and this file is the one place both
 * surfaces read them from either way.
 *
 * Neither names the order by id: `Jig.test.ts` pins the panel to never printing
 * one — 'o-3' is the database's name for an order, and every panel that shows
 * one shows its place in the queue instead.
 */
export const ALREADY_PICKED = 'THIS ORDER WANTS {length} — ALREADY PICKED';
export const PICK_DISAGREES = 'THIS ORDER WANTS {wanted} — YOU ARE ON {picked}';
/** Nobody at the rack, so there is no 'you' to be on the wrong bin. */
export const ORDER_WANTS = 'THIS ORDER WANTS {length}';
/**
 * B overrode the pre-pick and landed on the order's own length anyway. It is the
 * same bin as ALREADY_PICKED and the opposite claim about who is holding it: an
 * order-derived pick follows the next rollover on its own, B's does not.
 */
export const YOUR_PICK = 'YOUR PICK — {length}';

/**
 * One colour per state, so the floor and the panel paint the same fact the same
 * way. They are the order board's own voices (`BOARD_COLOURS`): a pick that
 * disagrees with the order is amber, never red, for the reason the board is —
 * it is pressure, not a fault, and nothing has gone wrong until the stick
 * reaches the ramp and the Dock bonks it.
 */
export const RACK_COLOURS: Record<RackTone, number> = {
    set: BOARD_COLOURS.now,
    warn: BOARD_COLOURS.urgent,
    idle: BOARD_COLOURS.waiting,
};

const BINS: PickedFuse[] = ['short', 'long'];
/** The gap between the two bins, so they read as two things and not one box. */
const BIN_GAP = 2;
const TAIL: Record<PickedFuse, number> = { short: 0.3, long: 0.62 };
/** The bins sit inside the rack tile, clear of the tile's own orange outline. */
const TILE_INSET = 4;

/** The part of a rack tile the bins are drawn in, for the world rack. */
export function rackTileBox(tile: Tile): RackBox {
    const x = tile[0] * TILE_PX;
    const y = tile[1] * TILE_PX;

    return {
        x0: x + TILE_INSET,
        y0: y + TILE_INSET,
        x1: x + TILE_PX - TILE_INSET,
        y1: y + TILE_PX - TILE_INSET,
    };
}

/**
 * SHORT on the left, LONG on the right, in that order at every size, because a
 * bin that swaps sides between the floor and the panel is two bins.
 */
export function rackBins(box: RackBox, picked: FuseLength, wanted: FuseLength): RackBin[] {
    const width = (box.x1 - box.x0 - BIN_GAP) / 2;

    return BINS.map((fuse, i) => {
        const x0 = i === 0 ? box.x0 : box.x1 - width;
        const isWanted = fuse === wanted;

        return {
            fuse,
            label: fuse.toUpperCase(),
            box: { x0, y0: box.y0, x1: x0 + width, y1: box.y1 },
            picked: fuse === picked,
            wanted: isWanted,
            // Only a pick somebody made can be the wrong one. With `picked` empty
            // the order's bin is still marked — that is what the board asked for
            // — but amber on it would accuse a crew of being on the wrong bin
            // while nobody is on any bin.
            warn: isWanted && picked !== '' && picked !== wanted,
            tail: width * TAIL[fuse],
        };
    });
}

/**
 * What the rack says under the bins. The agreeing case is the whole fix: it
 * names the length, says the order asked for it, and says it is already done —
 * so a first-time B learns that the choice exists, that it is meaningful, and
 * that they can leave it alone today.
 *
 * `fromOrder` is `JigMg.bPickFromOrder`, and it is what stops the sentence
 * claiming credit the game does not have. Once B has overridden the pre-pick,
 * the pick is theirs and stops following the order at the next rollover, so
 * saying ALREADY PICKED there would be promising an upkeep nothing performs.
 */
export function rackCaption(
    picked: FuseLength,
    wanted: FuseLength,
    fromOrder: boolean,
): RackCaption {
    if (wanted === '') return { text: NOTHING_ON_THE_BOARD, tone: 'idle' };

    if (picked === '') {
        return { text: fill(ORDER_WANTS, { length: wanted.toUpperCase() }), tone: 'idle' };
    }

    if (picked === wanted) {
        const template = fromOrder ? ALREADY_PICKED : YOUR_PICK;

        return { text: fill(template, { length: wanted.toUpperCase() }), tone: 'set' };
    }

    return {
        text: fill(PICK_DISAGREES, {
            wanted: wanted.toUpperCase(),
            picked: picked.toUpperCase(),
        }),
        tone: 'warn',
    };
}
