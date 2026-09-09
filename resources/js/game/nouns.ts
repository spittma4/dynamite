import { mmss } from './ui/format';

/**
 * The client's own player-facing names (F04), the way `constants.ts` holds its
 * own numbers.
 *
 * A name written out by hand in the file that needed it is a name that drifts:
 * review found four spellings of the finished stick, four of the fuse set,
 * three of the intake zone and two of the best keg, every one of them a literal
 * somebody typed a second time. Anything that names an **object**, a **place**
 * or a **state** that more than one surface says lives here once and is
 * imported. Sentences stay with the panel that says them.
 *
 * A clock phrase counts as a name: 'TRUCK IN 1:42' is what the truck is
 * called on three panels a player compares seconds apart, and it drifted into
 * three spellings the moment each panel wrote its own. The number comes from
 * `mmss`, the same formatter the dock has always used.
 *
 * The item nouns are not here. Those are the paint on the floor and they come
 * from `pluralOf` in `render/dropTargets.ts`, which is what the signs and the
 * shelf captions are built out of; a name derived from the level cannot drift
 * from the level. This file is for the names the client invents.
 */

/** The one phrase for the thing B fetches off the rack and tosses to A. */
export const FUSE_SET = 'FUSE SET';

/** The gold release, said the same way where it is made and where it is poured. */
export const PRIME_KEG = 'PRIME KEG';

/** The hazard-striped two tiles a hauler stands in to put a thing down. */
export const INTAKE_ZONE = 'the striped zone';

/** The board on the wall and the panel `Tab` opens are the same board. */
export const ORDER_BOARD = 'ORDER BOARD';

/** A book with nothing on it, said the same way at the rack and on the board. */
export const NOTHING_ON_THE_BOARD = 'NOTHING ON THE BOARD';

/** Why a station will not take your press: you are already carrying something. */
export const HANDS_FULL = 'HANDS FULL';

/** The currency the top-right bar measures. Was also 'the rep' at the Slammer. */
export const GROOVE = 'GROOVE';

/**
 * The truck clock, in the one wording every surface that shows it uses: the
 * `Tab` board, the dock panel and the bay wall over the doorway. They said
 * 'TRUCK IN' / 'NEXT TRUCK' / 'NEXT' for the same arrival and 'LEAVES' /
 * 'TRUCK LEAVES' for the same departure, on panels read seconds apart.
 */
export function truckIn(seconds: number): string {
    return `TRUCK IN ${mmss(seconds)}`;
}

export function truckLeaves(seconds: number): string {
    return `TRUCK LEAVES ${mmss(seconds)}`;
}

/** No clock: the truck has already pulled off and nothing else can be loaded. */
export const TRUCK_LEAVING = 'TRUCK LEAVING';
