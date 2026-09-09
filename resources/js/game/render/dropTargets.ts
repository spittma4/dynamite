import type { ItemType, LevelConfig, StationConfig, Tile } from '@shared';

/** Somewhere the thing in your hands is allowed to go. */
export interface DropTarget {
    stationId: string;
    tiles: Tile[];
}

const PLURAL: Partial<Record<ItemType, string>> = {
    keg: 'KEGS',
    casing: 'CASINGS',
    stick: 'STICKS',
    crate: 'CRATES',
    parts: 'PARTS',
};

/**
 * What a shelf is for, written on the floor. Without this the shelves are
 * identical grey boxes and the only way to learn that kegs go to Assembly is
 * to try every tile.
 */
export function shelfLabel(kind: 'in' | 'out', accepts: ItemType[] | undefined): string {
    if (kind === 'out') return 'OUT';
    if (!accepts || accepts.length === 0) return 'IN';

    return accepts.map((type) => PLURAL[type] ?? type.toUpperCase()).join(' · ');
}

/** The dock has no shelf — a stick is set down on a ramp lane instead. */
function acceptsAt(station: StationConfig, type: ItemType): Tile[] | null {
    if (station.type === 'dock') return type === 'stick' ? [...station.workTiles] : null;

    const shelf = station.inputShelf;

    if (!shelf) return null;

    const accepts = shelf.accepts as ItemType[] | undefined;

    return accepts && accepts.includes(type) ? [shelf.tile] : null;
}

/**
 * Every place the carried item may be put down, so the floor can light them up.
 * Output shelves are deliberately excluded: a keg goes *forward* to the station
 * that consumes it, never back onto the tray it was made on.
 */
export function dropTargets(type: ItemType, level: LevelConfig): DropTarget[] {
    const targets: DropTarget[] = [];

    for (const station of level.stations) {
        const tiles = acceptsAt(station, type);

        if (tiles && tiles.length > 0) targets.push({ stationId: station.id, tiles });
    }

    return targets;
}
