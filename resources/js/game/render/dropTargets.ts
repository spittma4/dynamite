import type { ItemType, LevelConfig, StationConfig, Tile } from '@shared';

import { FUSE_SET } from '../nouns';

/** Somewhere the thing in your hands is allowed to go. */
export interface DropTarget {
    stationId: string;
    tiles: Tile[];
}

// `parts` is the schema's name for the type, never the player's: the object it
// carries is the fuse set, which is what the rack, the cradle, the phase strip
// and the floor sign all call it.
const PLURAL: Partial<Record<ItemType, string>> = {
    keg: 'KEGS',
    casing: 'CASINGS',
    stick: 'STICKS',
    crate: 'CRATES',
    parts: `${FUSE_SET}S`,
};

/** What a sign would call a pile of these. */
export function pluralOf(type: ItemType): string {
    return PLURAL[type] ?? type.toUpperCase();
}

/** The thing a recipe key makes, or `null` when no recipe on this level makes it. */
function outputOf(product: string, recipes: LevelConfig['recipes']): ItemType | null {
    for (const [key, recipe] of Object.entries(recipes)) {
        if (key === product || recipe.output.product === product) return recipe.output.type;
    }

    return null;
}

/**
 * What the order board calls the thing an order wants. `OrderState.product` is
 * a recipe key — `red_stick` — and printing it raw put a fourth name for the
 * finished stick on a panel, in snake_case. The recipe knows what the key
 * makes, and that is the noun every other surface already uses for it.
 */
export function productLabel(product: string, recipes: LevelConfig['recipes']): string {
    return outputOf(product, recipes)?.toUpperCase() ?? product.replace(/_/g, ' ').toUpperCase();
}

/** The same noun a count needs — `4/8 STICKS` — off the signs' own plural. */
export function productPlural(product: string, recipes: LevelConfig['recipes']): string {
    const type = outputOf(product, recipes);

    return type ? pluralOf(type) : `${productLabel(product, recipes)}S`;
}

/**
 * Types a station puts on its own input shelf, which no player ever hauls:
 * `feed()` in `shared/src/sim/jig.ts` stocks Assembly's casings itself, because
 * Casing Prep is M2. Listing them as inputs sends players hunting for an item
 * the machine prints — the first thing a playtester got stuck on.
 */
export const SELF_STOCKED: readonly ItemType[] = ['casing'];

/** Of the types a shelf accepts, the ones a player has to carry there. */
export function haulableInputs(accepts: ItemType[] | undefined): ItemType[] {
    if (!accepts) return [];

    return accepts.filter((type) => !SELF_STOCKED.includes(type));
}

/** What this machine makes, from the level's recipes; `null` if it makes nothing. */
export function producedBy(
    station: StationConfig,
    recipes: LevelConfig['recipes'],
): ItemType | null {
    for (const recipe of Object.values(recipes)) {
        if (recipe.station === station.type) return recipe.output.type;
    }

    return null;
}

/**
 * What a shelf is for, written on the floor. Without this the shelves are
 * identical grey boxes and the only way to learn that kegs go to Assembly is
 * to try every tile. An input shelf names only what a player must bring and
 * says IN, so it reads as an instruction rather than a stock list; an out tray
 * names what is sitting on it, because Assembly shouting NEED KEGS is no help
 * while the machine that makes them has the word nowhere on it.
 */
export function shelfLabel(
    kind: 'in' | 'out',
    accepts: ItemType[] | undefined,
    produces: ItemType | null,
): string {
    if (kind === 'out') return produces ? `${pluralOf(produces)} OUT` : 'OUT';

    const haulable = haulableInputs(accepts);

    if (haulable.length > 0) return `${haulable.map(pluralOf).join(' · ')} IN`;

    return 'IN';
}

/**
 * The two signs on the keg errand, off the same builder that paints them. Three
 * sentences quoted them by hand — the Slammer's hands panel, the Jig's route
 * line and the help panel — so a level that named the shelf anything else would
 * have sent all three players to a sign the floor does not have.
 */
export const KEGS_IN = shelfLabel('in', ['keg'], null);
export const KEGS_OUT = shelfLabel('out', undefined, 'keg');

/**
 * Where one station will take the thing in your hands. The dock has no shelf —
 * a stick is set down on a ramp lane — and a fuse set is never shelved either:
 * `partsOnJig` arms the Jig's cradle from the hands of whoever is standing on a
 * work tile, so those tiles are its drop zone.
 */
function acceptsAt(station: StationConfig, type: ItemType, onShelf: number): Tile[] | null {
    if (station.type === 'dock') return type === 'stick' ? [...station.workTiles] : null;

    if (type === 'parts') {
        return station.type === 'assembly' ? [...station.workTiles] : null;
    }

    const shelf = advertisedShelf(station, type);

    if (!shelf) return null;

    // A shelf at its cap refuses the push and the server answers with a `bonk`
    // and no words, so a tile that pulses at a full shelf is a lie.
    return onShelf < shelf.capacity ? [shelf.tile] : null;
}

/**
 * The input shelf this station offers for this item, or `null`. Advertised
 * through the same filter the sign is written with, so the floor cannot light
 * up for something the sign does not name. The shelf still *takes* a
 * self-stocked type — `shelfPush` reads `shelf.accepts`, so a casing lifted off
 * it goes back on it, and the bare floor takes anything — it is simply never
 * offered as somewhere a player was sent to.
 */
function advertisedShelf(
    station: StationConfig,
    type: ItemType,
): { tile: Tile; capacity: number } | null {
    const shelf = station.inputShelf;

    if (!shelf) return null;

    return haulableInputs(shelf.accepts as ItemType[] | undefined).includes(type) ? shelf : null;
}

/**
 * Every place the carried item may be put down, so the floor can light them up.
 * Output shelves are deliberately excluded: a keg goes *forward* to the station
 * that consumes it, never back onto the tray it was made on.
 */
export function dropTargets(
    type: ItemType,
    level: LevelConfig,
    onShelf: ReadonlyMap<string, number>,
): DropTarget[] {
    const targets: DropTarget[] = [];

    for (const station of level.stations) {
        const tiles = acceptsAt(station, type, onShelf.get(station.id) ?? 0);

        if (tiles && tiles.length > 0) targets.push({ stationId: station.id, tiles });
    }

    return targets;
}

/**
 * Where the thing in your hands belongs and is being refused. Once a shelf hits
 * its cap `dropTargets` yields nothing at all, so the floor went dark at the
 * exact moment the player needed it loudest: no pulsing tile, no lit apron, and
 * `E` answering with a wordless `bonk`. A destination that is refusing is not
 * the same message as a destination that never existed, so it is still drawn —
 * in the alert colour, and never as an invitation.
 */
export function blockedTargets(
    type: ItemType,
    level: LevelConfig,
    onShelf: ReadonlyMap<string, number>,
): DropTarget[] {
    const targets: DropTarget[] = [];

    for (const station of level.stations) {
        const shelf = station.type === 'dock' ? null : advertisedShelf(station, type);

        if (shelf && (onShelf.get(station.id) ?? 0) >= shelf.capacity) {
            targets.push({ stationId: station.id, tiles: [shelf.tile] });
        }
    }

    return targets;
}
