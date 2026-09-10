import { TILE_PX, type StationConfig, type Tile, helperPostsOf } from '@shared';

import type { Seg } from './machine';

/**
 * The helper posts, painted on the floor (N4). The report was "you can 'sit'/press
 * E and get stuck on the squares around a station — you should only be able to
 * press E on something you can pick up or a station that you're working", and half
 * of that is geometry (`helperPostsOf` shrank the join zone to the four tiles
 * beside the operator) and half is that the tiles never looked like anything.
 *
 * Every ring tile was drawn the same way — a 1 px grey dashed square at 0.7 alpha,
 * the same mark on the corridor as on the post — so there was nothing to tell a
 * player which of the twenty tiles `E` would answer on. The ring keeps its dashes,
 * because it is also F10's fuel apron and the DANGER stripes are hung off it. A
 * post gets corner brackets instead: the stand-here mark of a real factory floor,
 * and in the same family as the hazard stripes on the intake apron
 * (`render/intake.ts`) without being a second drop zone.
 *
 * The brackets are painted twice. Dormant, in the statics, because a post whose
 * machine nobody is running refuses the press (`fullyManned`) and a mark that
 * promised otherwise would be the same lie at one remove. Live, over the top, the
 * moment every work tile is taken — which is the rule stated in paint.
 */

/** The arm of one corner bracket, and how far the bracket sits inside the tile. */
export const POST_ARM = 7;
export const POST_INSET = 3;

/**
 * Thicker than the 2 px the work and rack tiles are outlined at. Partly because
 * paint on a floor is thick, and partly so the two marks are separable in a frame
 * and in a test: a work tile is a full 2 px box in `STATION_COLOURS.work` and a
 * post is a 3 px bracket in the same yellow, which is the shape doing the telling.
 */
export const POST_WIDTH = 3;

/** The one word on the floor; the helper's panel counts in the same noun. */
export const POST_LABEL = 'HANDS';

/** The four corner brackets of one post: eight segments, two to a corner. */
export function postBrackets(tile: Tile): Seg[] {
    const x0 = tile[0] * TILE_PX + POST_INSET;
    const y0 = tile[1] * TILE_PX + POST_INSET;
    const x1 = (tile[0] + 1) * TILE_PX - POST_INSET;
    const y1 = (tile[1] + 1) * TILE_PX - POST_INSET;

    return [
        { x1: x0, y1: y0, x2: x0 + POST_ARM, y2: y0 },
        { x1: x0, y1: y0, x2: x0, y2: y0 + POST_ARM },
        { x1: x1, y1: y0, x2: x1 - POST_ARM, y2: y0 },
        { x1: x1, y1: y0, x2: x1, y2: y0 + POST_ARM },
        { x1: x0, y1: y1, x2: x0 + POST_ARM, y2: y1 },
        { x1: x0, y1: y1, x2: x0, y2: y1 - POST_ARM },
        { x1: x1, y1: y1, x2: x1 - POST_ARM, y2: y1 },
        { x1: x1, y1: y1, x2: x1, y2: y1 - POST_ARM },
    ];
}

/**
 * Whether a press on a post could be answered here at all. `helperPostsOf` is pure
 * geometry, so it yields five ring tiles beside `dock-a`'s ramp lanes — and nothing
 * can ever join one: `pressStationAtZone` (game-server/src/sim/stations.ts) skips
 * every station whose `joinMode` is not `press`, and `syncStandMembers` joins only
 * the role `work`. Five brackets and a caption painted there are the same lie at one
 * remove as the twenty-tile join zone N4 reported, and permanent.
 */
function postsAnswer(cfg: StationConfig): boolean {
    return cfg.joinMode === 'press';
}

export interface HelperPosts {
    tiles: Tile[];
    brackets: Seg[];
    /** Where the one caption goes, or `null` when the station has no posts. */
    caption: { x: number; y: number } | null;
}

/**
 * Every post of one station, with a single caption over the longest run of them.
 *
 * One word, not one per tile: four captions on four adjacent tiles is the same
 * word printed four times in the aisle a hauler walks, and the mark the player has
 * to learn is the bracket. The run is picked along the row furthest from the
 * machine's top edge — the posts in the open aisle rather than the ones wedged
 * between the machine and a shelf, which is where a player standing back reads it.
 */
export function helperPosts(cfg: StationConfig): HelperPosts {
    const tiles = postsAnswer(cfg) ? helperPostsOf(cfg) : [];

    if (tiles.length === 0) return { tiles, brackets: [], caption: null };

    const row = Math.max(...tiles.map(([, y]) => y));
    const xs = tiles.filter(([, y]) => y === row).map(([x]) => x);

    return {
        tiles,
        brackets: tiles.flatMap((tile) => postBrackets(tile)),
        caption: {
            x: ((Math.min(...xs) + Math.max(...xs)) / 2 + 0.5) * TILE_PX,
            y: (row + 0.5) * TILE_PX,
        },
    };
}

/**
 * Whether `E` on a post would be answered: the server refuses a helper join until
 * every work tile is held (`fullyManned`, `game-server/src/sim/stations.ts`), so a
 * lit bracket means the press works and a dim one means it will not. A `stand`
 * station has no press to answer at all, so it never lights — four manned ramp
 * lanes used to light five dock brackets to full yellow.
 */
export function postsAreLive(cfg: StationConfig, occupied: ReadonlySet<string>): boolean {
    if (!postsAnswer(cfg) || cfg.workTiles.length === 0) return false;

    return cfg.workTiles.every(([x, y]) => occupied.has(`${x},${y}`));
}
