import { TILE_PX, type Tile, tileKey } from '@shared';

/**
 * The machine's body (N3): the silhouette of one station, its top, its front,
 * the plate its name is bolted to and the console its crew stands at. Pure
 * pixels — `render/Stations.ts` paints exactly what this returns.
 *
 * The playtest line was "the gameboard is better but just feels off for some
 * reason. Some of the words/signs are just there… I bet making the stations more
 * of a 'machine' on the board might fix it a lot." The old drawing is why: every
 * machine tile was filled on its own and given its own 2 px top highlight, so
 * Assembly's six tiles read as six boxes in a row with a word floating over the
 * middle of them. A word on a rectangle is a label. A body with a lit top, a
 * shaded front, a mouth on the intake side and a console on the working side is
 * a machine, and its name is then the machine's own rather than a caption near
 * it.
 *
 * Everything here is derived from the tile set `footprintOf` already hands back,
 * so a station's silhouette cannot disagree with the tiles a player cannot walk
 * through.
 */

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface Seg {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

/** The lit strip where nothing stands above the block. */
export const COWL_PX = 5;
/** The shadow along the front, which is the face the crew works from. */
export const PLINTH_PX = 3;
/** The nameplate's margin around the word it carries, per side. */
const PLATE_PAD_X = 5;
const PLATE_PAD_Y = 3;
/** Monospace is about 0.6 em wide, which is what sizes the plate off a name. */
const CHAR_RATIO = 0.6;
/** How far in from the plate's ends the two bolts sit. */
const BOLT_INSET = 4;
/** How far the intake plate stands out past the bins bolted into it. */
const FACE_PAD = 3;
/** The console band on the front of the body, and the dials read off it. */
const LIP_PX = 7;
const DIALS = 3;

export interface MachineBody {
    /** The block in pixels: where the nameplate and the progress ring belong. */
    bounds: Rect;
    /** One slab per run of tiles on a row, so a body is filled as a body. */
    slabs: Rect[];
    /** The silhouette: the edges with floor on the other side, runs merged. */
    outline: Seg[];
    cowl: Rect[];
    plinth: Rect[];
}

/**
 * The body of one station, or `null` for a station with no machine tiles inside
 * its footprint at all — which is the Dock, whose working face is the truck bay
 * and whose ramp lanes `render/Floor.ts` owns.
 */
export function machineBody(tiles: Tile[]): MachineBody | null {
    if (tiles.length === 0) return null;

    const inBlock = new Set(tiles.map(([x, y]) => tileKey(x, y)));
    const xs = tiles.map(([x]) => x);
    const ys = tiles.map(([, y]) => y);
    const bounds = {
        x: Math.min(...xs) * TILE_PX,
        y: Math.min(...ys) * TILE_PX,
        w: (Math.max(...xs) - Math.min(...xs) + 1) * TILE_PX,
        h: (Math.max(...ys) - Math.min(...ys) + 1) * TILE_PX,
    };
    const tops = horizontalRuns(tiles, inBlock, -1);
    const bottoms = horizontalRuns(tiles, inBlock, 1);

    return {
        bounds,
        slabs: rowRuns(tiles),
        outline: [
            ...tops.map((run) => edge(run, run.y * TILE_PX)),
            ...bottoms.map((run) => edge(run, (run.y + 1) * TILE_PX)),
            ...verticalRuns(tiles, inBlock, -1).map((run) => side(run, run.x * TILE_PX)),
            ...verticalRuns(tiles, inBlock, 1).map((run) => side(run, (run.x + 1) * TILE_PX)),
        ],
        cowl: tops.map((run) => ({
            x: run.from * TILE_PX,
            y: run.y * TILE_PX,
            w: (run.to - run.from + 1) * TILE_PX,
            h: COWL_PX,
        })),
        plinth: bottoms.map((run) => ({
            x: run.from * TILE_PX,
            y: (run.y + 1) * TILE_PX - PLINTH_PX,
            w: (run.to - run.from + 1) * TILE_PX,
            h: PLINTH_PX,
        })),
    };
}

export interface Nameplate {
    plate: Rect;
    bolts: { x: number; y: number }[];
}

/**
 * The plate the station's name is bolted to, centred on the point the name is
 * already drawn at (`machineCentre`). Sized off the name's own length because
 * the plate is painted into the statics before Phaser has measured anything, and
 * monospace is the one font the client uses.
 */
export function nameplate(
    centre: { x: number; y: number },
    chars: number,
    size: number,
): Nameplate {
    const w = chars * size * CHAR_RATIO + PLATE_PAD_X * 2;
    const h = size + PLATE_PAD_Y * 2;
    const plate = { x: centre.x - w / 2, y: centre.y - h / 2, w, h };

    return {
        plate,
        bolts: [
            { x: plate.x + BOLT_INSET, y: centre.y },
            { x: plate.x + w - BOLT_INSET, y: centre.y },
        ],
    };
}

/**
 * The opening the hopper's bins are bolted into, or `null` on a face with no
 * bins. It stops at the bins' own bottom edge: the apron stripes run across the
 * lower part of the shelf tile (`stripeSegments`) and a plate that covered them
 * would take the floor marking off the one tile a hauler aims at.
 */
export function facePlate(
    bins: { x0: number; x1: number; top: number; bottom: number }[],
): Rect | null {
    if (bins.length === 0) return null;

    const x0 = Math.min(...bins.map((bin) => bin.x0)) - FACE_PAD;
    const x1 = Math.max(...bins.map((bin) => bin.x1)) + FACE_PAD;
    const top = Math.min(...bins.map((bin) => bin.top));
    const bottom = Math.max(...bins.map((bin) => bin.bottom));

    return { x: x0, y: top, w: x1 - x0, h: bottom - top };
}

export interface ControlLip {
    band: Rect;
    dials: { x: number; y: number }[];
}

/**
 * The console on the front of the body, over the tiles the crew stands on, or
 * `null` when no front edge of the body is above one of them. The work tiles were
 * outlined on the floor and the machine above them was blank, so nothing about
 * the body said which side of it you operate.
 *
 * Measured against the body's own front edges rather than its bounding box,
 * because a station's bbox swallows whatever happens to be inside it. `dock-a`'s
 * footprint takes in the wall stub beside the truck bay and one tile past the
 * ramp, with its four lanes as open floor between them — against the bbox the
 * console came out as a band painted straight across the lanes the crew walks on.
 */
export function controlLip(body: MachineBody, workTiles: Tile[]): ControlLip | null {
    if (workTiles.length === 0) return null;

    const xs = workTiles.map(([x]) => x);
    const crewLeft = Math.min(...xs) * TILE_PX;
    const crewRight = (Math.max(...xs) + 1) * TILE_PX;
    let band: Rect | null = null;

    // The widest front edge the crew actually stand at, so a body with two of
    // them puts its console on the one they work from.
    for (const front of body.plinth) {
        const left = Math.max(front.x, crewLeft);
        const right = Math.min(front.x + front.w, crewRight);
        const bottom = front.y + front.h;

        if (right - left > (band?.w ?? 0)) {
            band = { x: left, y: bottom - LIP_PX, w: right - left, h: LIP_PX };
        }
    }

    if (!band || band.w <= 0) return null;

    const pitch = band.w / (DIALS + 1);
    const at = band;

    return {
        band,
        dials: Array.from({ length: DIALS }, (_, i) => ({
            x: at.x + pitch * (i + 1),
            y: at.y + at.h / 2,
        })),
    };
}

/**
 * Whether a point is on a tile of the block rather than merely inside its bbox.
 * `machineCentre` is the mean of a station's machine tiles, and for the Dock —
 * whose block is a wall stub either side of the bay — that mean lands in the
 * middle of the empty bay, so the nameplate came out bolted to bare floor with
 * the ramp lanes under it.
 */
export function onMachine(body: MachineBody, at: { x: number; y: number }): boolean {
    return body.slabs.some(
        (slab) =>
            at.x >= slab.x && at.x < slab.x + slab.w && at.y >= slab.y && at.y < slab.y + slab.h,
    );
}

interface Run {
    y: number;
    from: number;
    to: number;
}

/** Every row of the block as contiguous runs of tiles, left to right. */
function rowRuns(tiles: Tile[]): Rect[] {
    return runsBy(
        tiles,
        ([, y]) => y,
        ([x]) => x,
    ).map((run) => ({
        x: run.from * TILE_PX,
        y: run.y * TILE_PX,
        w: (run.to - run.from + 1) * TILE_PX,
        h: TILE_PX,
    }));
}

/**
 * The runs of tiles along a row whose neighbour one step away in `dy` is not in
 * the block — the top edges at `dy === -1`, the front edges at `dy === 1`. Runs
 * rather than tiles because a seam drawn between two tiles of the same body is
 * exactly what made the block look tiled.
 */
function horizontalRuns(tiles: Tile[], inBlock: Set<string>, dy: -1 | 1): Run[] {
    const open = tiles.filter(([x, y]) => !inBlock.has(tileKey(x, y + dy)));

    return runsBy(
        open,
        ([, y]) => y,
        ([x]) => x,
    );
}

function verticalRuns(
    tiles: Tile[],
    inBlock: Set<string>,
    dx: -1 | 1,
): { x: number; from: number; to: number }[] {
    const open = tiles.filter(([x, y]) => !inBlock.has(tileKey(x + dx, y)));

    return runsBy(
        open,
        ([x]) => x,
        ([, y]) => y,
    ).map((run) => ({ x: run.y, from: run.from, to: run.to }));
}

/** Group tiles by one axis, then split each group into contiguous runs. */
function runsBy(tiles: Tile[], lane: (t: Tile) => number, along: (t: Tile) => number): Run[] {
    const lanes = new Map<number, number[]>();

    for (const tile of tiles) {
        const key = lane(tile);

        lanes.set(key, [...(lanes.get(key) ?? []), along(tile)]);
    }

    const runs: Run[] = [];

    for (const [key, values] of [...lanes.entries()].sort((a, b) => a[0] - b[0])) {
        let from = -Infinity;
        let last = -Infinity;

        for (const at of [...values].sort((a, b) => a - b)) {
            if (at !== last + 1) {
                if (from > -Infinity) runs.push({ y: key, from, to: last });

                from = at;
            }

            last = at;
        }

        if (from > -Infinity) runs.push({ y: key, from, to: last });
    }

    return runs;
}

function edge(run: Run, y: number): Seg {
    return { x1: run.from * TILE_PX, y1: y, x2: (run.to + 1) * TILE_PX, y2: y };
}

function side(run: { x: number; from: number; to: number }, x: number): Seg {
    return { x1: x, y1: run.from * TILE_PX, x2: x, y2: (run.to + 1) * TILE_PX };
}
