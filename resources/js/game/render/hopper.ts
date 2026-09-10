import { TILE_PX, type FuseLength, type ItemType, type StationConfig, type Tile } from '@shared';

import { SELF_STOCKED, pluralOf } from './dropTargets';
import type { RackTone } from './fuseRack';
import { outwardSide } from './intake';

/**
 * The furniture standing on a shelf tile (F15 §2): a funnel you pour into on
 * the left face of a machine, a chute that hands out on the right. Pure pixels
 * and words — `render/Stations.ts` paints exactly what this returns.
 *
 * It composes with the apron rather than replacing it. The apron is floor
 * marking — stripes across the shelf tile and the tile a hauler stands on — and
 * says *stand here and let go*; the hopper is what stands on the tile and says
 * *here is what is in it and how much room is left*. So the hopper stops short
 * of the bottom of the shelf tile, where the stripes are, and grows upward into
 * the machine instead: the tile above every shelf is machine wall, so it never
 * eats a tile anybody walks on. That is a rule rather than a hope —
 * `validateLevelOnLayout` refuses a shelf with walkable floor above it, beside
 * the reach check on the same tile.
 *
 * The reason any of this exists: an 8 px glyph in a slot grid looks the same
 * from the Dock end of the floor whether a tray holds one keg or six, and "Boom
 * Powder is drowning Assembly" is the one sentence the whole game is built to
 * make sayable while pointing.
 */

/** The hopper's own box: 28 px of the tile's 32, so the tile edge still reads. */
const HOPPER_W = 28;
const SIDE_INSET = (TILE_PX - HOPPER_W) / 2;
/**
 * What each bin after the first adds to the face, in pixels.
 *
 * One bin fits the shelf tile, which is every out tray in the game. Three do
 * not: at a share of one tile the keg funnel came out 12 px wide and the AUTO
 * silo 3.6 px — narrower than the word read down it — the moment `parts` joined
 * `accepts` for N2. So the intake *side* of a machine is as wide as the bins
 * standing on it and grows **inward**, away from the aisle: the tile a hauler
 * faces stays the aiming point the apron and the chevron mark, and the frontage
 * it borrows is the machine wall beside the shelf, which nobody walks on.
 */
const EXTRA_BIN_PX = TILE_PX / 2;
/** How far down into the shelf tile the body reaches; the rest is apron. */
const BODY_PX = 24;
/** A funnel's neck, and the chute's lip over the tile you pick up from. */
const THROAT_W = 12;
/**
 * Where the walls stop sloping, as a fraction of the height. A funnel tapers
 * early — it is read end-on and the neck is most of what you see — while a
 * chute keeps its body wide and spouts late, so the product in it stays
 * countable right up to the lip.
 */
const FUNNEL_KINK = 0.6;
const CHUTE_KINK = 0.75;
/**
 * A silo's width, in pixels rather than as a share of the face: it is not
 * somewhere anybody aims, so its width carries no information beyond *small*,
 * and the one thing it has to stay is wide enough for the word read down it. As
 * a share it shrank with every type added to `accepts` — at three bins it came
 * out 3.6 px, narrower than AUTO is tall, and the one genuinely new fact the
 * hoppers carry read as a label on the funnel beside it.
 */
const SILO_PX = 8;
/** How tall one band of the fill column is drawn, in pixels. */
const FILL_STEP = 2;

/** The word read down a silo: this bin fills itself, so never go hunting. */
export const AUTO = 'AUTO';

/**
 * The length tag on an empty book. `usableSetOnShelf` (`shared/src/sim/jig.ts`)
 * treats `cradleWants === ''` as a wildcard — a machine with no order to
 * disagree with has no preference to defend — so the bin says so rather than
 * going blank and leaving the tag looking broken.
 */
export const ANY = 'ANY';

export type BinKind = 'funnel' | 'chute' | 'silo';

export interface HopperBox {
    x0: number;
    x1: number;
    top: number;
    bottom: number;
}

export interface HopperBin {
    kind: BinKind;
    /** `null` on an out tray, which holds whatever the machine happens to make. */
    type: ItemType | null;
    label: string;
    count: number;
    /** 0..1 of the shelf's own capacity, so the bins on one face stack to it. */
    fill: number;
    /** `feed()` stocks it and no player ever brings one — a closed silo, never a funnel. */
    selfStocked: boolean;
    box: HopperBox;
}

export interface Hopper {
    kind: 'funnel' | 'chute';
    /** The shelf tile; the body rises into the tile above it. */
    tile: Tile;
    fill: number;
    full: boolean;
    count: number;
    capacity: number;
    bins: HopperBin[];
    /** The height the `n/cap` counter sits at; `Stations.ts` centres it on the shelf. */
    throat: { x: number; y: number };
}

export interface FillRow {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * The hopper on one face of a station, or `null` when that face has no shelf —
 * Boom Powder's input and both of the Dock's.
 *
 * `contents` is the types on the shelf in the server's own order. The **bins**
 * come from what the shelf accepts rather than from what is on it, because a
 * funnel is furniture: an empty in-tray is exactly the state a hauler is
 * hunting for it in, and one that vanished when the shelf went bare would be
 * missing at the only moment it is needed.
 */
export function hopperOf(
    station: StationConfig,
    side: 'in' | 'out',
    contents: ItemType[],
): Hopper | null {
    const shelf = side === 'in' ? station.inputShelf : station.outputShelf;

    if (!shelf) return null;

    const kind = side === 'in' ? 'funnel' : 'chute';
    const capacity = shelf.capacity;
    const count = contents.length;
    const accepts = station.inputShelf?.accepts as ItemType[] | undefined;
    // An out tray is one chute: it holds whatever the machine makes, and the
    // sign on the floor already names that (`shelfLabel`, `render/dropTargets`).
    const types = side === 'in' ? (accepts ?? [null]) : [null];
    const bins = binsOf(types, kind, shelf.tile, contents, capacity, inwardOf(station, shelf.tile));
    const filled = bins.find((bin) => !bin.selfStocked) ?? bins[0];

    return {
        kind,
        tile: shelf.tile,
        fill: fractionOf(count, capacity),
        full: capacity > 0 && count >= capacity,
        count,
        capacity,
        bins,
        throat: throatOf(filled),
    };
}

/**
 * The silhouette, as the points a stroke walks: down the left wall, across the
 * bottom, up the right wall. A funnel is left open at the top — you pour into
 * it — so the run deliberately does not close.
 */
export function outlineOf(bin: HopperBin): { x: number; y: number }[] {
    const { top, bottom } = bin.box;
    const kink = kinkOf(bin);
    const mouth = spanAt(bin, top);
    const waist = spanAt(bin, kink);
    const foot = spanAt(bin, bottom);

    return [
        { x: mouth.x0, y: top },
        { x: waist.x0, y: kink },
        { x: foot.x0, y: bottom },
        { x: foot.x1, y: bottom },
        { x: waist.x1, y: kink },
        { x: mouth.x1, y: top },
    ];
}

/**
 * The fill column, bottom up, as bands that follow the silhouette. Bands rather
 * than one polygon because the shape has a kink in it and Phaser fills convex
 * runs; each band is measured at its own lower edge, so the column always sits
 * inside the walls rather than bleeding through them.
 */
export function fillRows(bin: HopperBin, step = FILL_STEP): FillRow[] {
    if (bin.fill <= 0) return [];

    const { top, bottom } = bin.box;
    const surface = bottom - (bottom - top) * Math.min(1, bin.fill);
    const rows: FillRow[] = [];

    for (let y = bottom - step; y >= surface - 0.001; y -= step) {
        const span = spanAt(bin, y + step);

        rows.push({ x: span.x0, y, w: span.x1 - span.x0, h: step });
    }

    return rows;
}

/** Where the fill's surface is, so a glyph can sit on top of what is in the bin. */
export function surfaceOf(bin: HopperBin): number {
    const { top, bottom } = bin.box;

    return bottom - (bottom - top) * Math.min(1, bin.fill);
}

/** The bin's own throat: the middle of its narrowest span. */
export function throatOf(bin: HopperBin | undefined): { x: number; y: number } {
    if (!bin) return { x: 0, y: 0 };

    const y = kinkOf(bin);
    const span = spanAt(bin, y);

    return { x: (span.x0 + span.x1) / 2, y };
}

/** How wide the bin is at one height. Every wall in the file is drawn from this. */
function spanAt(bin: HopperBin, y: number): { x0: number; x1: number } {
    const { x0, x1, top } = bin.box;

    if (bin.kind === 'silo') return { x0, x1 };

    const kink = kinkOf(bin);
    const t = Math.min(1, Math.max(0, (y - top) / (kink - top)));
    const throat = Math.min(THROAT_W, x1 - x0);

    if (bin.kind === 'chute') return { x0: x0 + (x1 - throat - x0) * t, x1 };

    const centre = (x0 + x1) / 2;

    return {
        x0: x0 + (centre - throat / 2 - x0) * t,
        x1: x1 + (centre + throat / 2 - x1) * t,
    };
}

function kinkOf(bin: HopperBin): number {
    const { top, bottom } = bin.box;
    const at = bin.kind === 'chute' ? CHUTE_KINK : FUNNEL_KINK;

    return top + (bottom - top) * at;
}

function fractionOf(count: number, capacity: number): number {
    return capacity > 0 ? Math.min(1, count / capacity) : 0;
}

/**
 * The face split between the bins on it. A silo takes a third of a funnel's
 * width — it is not somewhere anybody aims, and the bin that needs to be hit
 * from across the room is the one a player carries something to.
 */
function binsOf(
    types: (ItemType | null)[],
    kind: 'funnel' | 'chute',
    tile: Tile,
    contents: ItemType[],
    capacity: number,
    inward: -1 | 1,
): HopperBin[] {
    const face = HOPPER_W + (types.length - 1) * EXTRA_BIN_PX;
    const silos = types.filter(isSelfStocked).length;
    const funnels = types.length - silos;
    // A shelf with nothing on it a player carries has no funnel to give the rest
    // of the face to, so the silo takes it; otherwise the silos keep their fixed
    // width and the bins a player aims at share everything that is left.
    const siloPx = funnels === 0 ? face / Math.max(silos, 1) : SILO_PX;
    const funnelPx = funnels === 0 ? 0 : (face - silos * siloPx) / funnels;
    const top = (tile[1] - 1) * TILE_PX;
    const bottom = tile[1] * TILE_PX + BODY_PX;
    // The aisle edge of the shelf tile, so the first type a shelf accepts is the
    // bin nearest the player and the face runs back into the machine from there.
    let x = inward > 0 ? tile[0] * TILE_PX + SIDE_INSET : (tile[0] + 1) * TILE_PX - SIDE_INSET;

    return types.map((type) => {
        const width = isSelfStocked(type) ? siloPx : funnelPx;
        const box =
            inward > 0
                ? { x0: x, x1: x + width, top, bottom }
                : { x0: x - width, x1: x, top, bottom };
        const count = type === null ? contents.length : contents.filter((c) => c === type).length;
        const selfStocked = isSelfStocked(type);

        x += inward * width;

        return {
            kind: selfStocked ? 'silo' : kind,
            type,
            label: type === null ? '' : pluralOf(type),
            count,
            fill: fractionOf(count, capacity),
            selfStocked,
            box,
        };
    });
}

function isSelfStocked(type: ItemType | null): boolean {
    return type !== null && SELF_STOCKED.includes(type);
}

/** Which way the face may grow: into the machine, never across the aisle. */
function inwardOf(station: StationConfig, tile: Tile): -1 | 1 {
    return (outwardSide(station, tile) * -1) as -1 | 1;
}

export interface FuseBin {
    /** `JigMg.cradleWants`: the length the machine will reach into the bin for. */
    wants: FuseLength;
    /** The word on the tag — that length, or `ANY` on a day with no order. */
    tag: string;
    tone: RackTone;
    banked: number;
    usable: number;
}

/**
 * What the fuse bin says beyond how full it is (N2). A fuse set is the one
 * material on an input shelf that can be the *wrong* one: `usableSetOnShelf`
 * (`shared/src/sim/jig.ts`) only arms the cradle from a set the seated order can
 * use, so a bin of LONG sets under a SHORT order stops the machine exactly as
 * dead as an empty bin while the `n/cap` on the shelf reads stocked.
 *
 * The three tones are the rack's own (`RACK_COLOURS`), because the bin and the
 * rack are two ways of answering one question and a second palette for it would
 * be a second language. Amber, never red, for the rack's reason: a length that
 * disagrees is pressure, not a fault — nothing has gone wrong until the stick
 * reaches the ramp.
 */
export function fuseBinOf(wants: FuseLength, banked: FuseLength[]): FuseBin {
    const usable = wants === '' ? banked.length : banked.filter((l) => l === wants).length;

    return {
        wants,
        tag: wants === '' ? ANY : wants.toUpperCase(),
        tone: banked.length === 0 ? 'idle' : usable > 0 ? 'set' : 'warn',
        banked: banked.length,
        usable,
    };
}
