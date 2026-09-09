import type { ItemType } from '../shared';

/**
 * The shift's event counters (contracts §10.7). Every count in the report card
 * is bumped here at the moment it happens rather than reconstructed at day end,
 * because most of these events destroy the thing that would have proved them.
 */

export type TallyKey = 'kegsMade' | 'kegsUsed' | 'defects' | 'incidents';
export type PlayerTallyKey =
    | 'produced'
    | 'bubbles'
    | 'drops'
    | 'sooted'
    | 'fusesStomped'
    | 'niceSaves'
    | 'truckRides';
export type DestroyCause = 'blast' | 'fizzle';
export type ItemCounts = Record<ItemType, number>;

const TALLY_KEYS: readonly TallyKey[] = ['kegsMade', 'kegsUsed', 'defects', 'incidents'];
const PLAYER_TALLY_KEYS: readonly PlayerTallyKey[] = [
    'produced',
    'bubbles',
    'drops',
    'sooted',
    'fusesStomped',
    'niceSaves',
    'truckRides',
];
const ITEM_TYPES: readonly ItemType[] = ['keg', 'casing', 'stick', 'crate', 'parts'];

/** Every key present from the start, so a report never has to treat a missing key as zero. */
function zeroed<K extends string>(keys: readonly K[]): Record<K, number> {
    return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

export class RunTally {
    counts: Record<TallyKey, number> = zeroed(TALLY_KEYS);
    destroyedByType: ItemCounts = zeroed(ITEM_TYPES);
    wastedByType: ItemCounts = zeroed(ITEM_TYPES);
    /** Keyed by `PlayerState.userId`, so a rejoin lands in the row it left. */
    readonly players = new Map<string, Record<PlayerTallyKey, number>>();

    bump(key: TallyKey): void {
        this.counts[key]++;
    }

    bumpPlayer(userId: string, key: PlayerTallyKey): void {
        let row = this.players.get(userId);

        if (row === undefined) {
            row = zeroed(PLAYER_TALLY_KEYS);
            this.players.set(userId, row);
        }

        row[key]++;
    }

    /**
     * Only a blast destroys a keg and only a fizzle destroys a stick, so the
     * report reads the cause off the type and `_cause` stays a claim the caller
     * has to make rather than a second number that could disagree.
     */
    destroyed(type: ItemType, _cause: DestroyCause): void {
        this.destroyedByType[type]++;
    }

    /**
     * Material lost to something that is neither a blast nor a fizzle: a wiped
     * shelf, a rider's cargo, a keg nobody could put down. The P&L bills it, and
     * it is kept apart from `destroyedByType` so the report's hazard lines never
     * claim an explosion the day did not have.
     */
    scrap(type: ItemType): void {
        this.wastedByType[type]++;
    }

    reset(): void {
        this.counts = zeroed(TALLY_KEYS);
        this.destroyedByType = zeroed(ITEM_TYPES);
        this.wastedByType = zeroed(ITEM_TYPES);
        this.players.clear();
    }
}
