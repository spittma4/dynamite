import type { ItemType } from '../shared';

/**
 * STUB (contracts §1 and §10.7). F11 owns this module and replaces the body
 * when the day report lands; until then the counters are real, because F05,
 * F06, F09 and F10 all bump them on their way in and a no-op would hide a
 * miscount until the report finally read it.
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

    /** The stub counts the loss by type; F11 adds the split by `_cause` the report needs. */
    destroyed(type: ItemType, _cause: DestroyCause): void {
        this.destroyedByType[type]++;
    }

    reset(): void {
        this.counts = zeroed(TALLY_KEYS);
        this.destroyedByType = zeroed(ITEM_TYPES);
        this.players.clear();
    }
}
