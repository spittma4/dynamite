/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

import {
    FUSE_SET,
    GROOVE,
    HANDS_FULL,
    INTAKE_ZONE,
    NOTHING_ON_THE_BOARD,
    ORDER_BOARD,
    PRIME_KEG,
    TRUCK_LEAVING,
} from '../nouns';
import { RE_ARMING } from '../minigames/Jig';
import { KEGS_OUT, pluralOf, shelfLabel } from '../render/dropTargets';
import { grooveBand } from '../ui/grooveBand';

/** The shipped bands (`config/game/levels/*.json`), enough to reach each label. */
const THRESHOLDS = { onFire: 85, groove: 65, churn: 35, meltdown: 15 };

/**
 * The vocabulary guard.
 *
 * Review counted four player-facing names for the finished stick, four for the
 * fuse set, three for the intake zone and two for the best keg. None of them
 * arrived as a decision — each was somebody typing a word a second time in the
 * file they were working in, and every one of them was still true the day it
 * was written. So the edits that collapsed them are worth less than this: the
 * test reads the client's own sources and fails if a guarded name is written
 * out anywhere but the one file that defines it, or if a spelling the game has
 * already retired comes back.
 *
 * What it cannot catch is a brand-new invented noun: no regex finds a name
 * nobody has written down. Adding a fifth spelling of the stick to a module
 * leaves this file green. A new player-facing name still has to be put in
 * `nouns.ts` — or in `RETIRED` — by hand, at review time.
 *
 * It reads source text rather than calling anything, because the defect it
 * guards against is textual: a literal, in a file, that nobody imported.
 */

/**
 * Every client module as text, through the bundler rather than the filesystem:
 * the client tsconfig deliberately ships no Node types, and a guard that made
 * the browser bundle import `node:fs` to exist would be paying for itself with
 * the thing it is guarding.
 */
const RAW: Record<string, string> = import.meta.glob('../**/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
});

/**
 * Two places outside the client bundle where the game still talks to a player,
 * and the guard could not see either: `config/game/copy.json` holds the joke
 * lines (its `events.rushOrder` was quietly carrying a fifth name for the
 * finished stick), and the server's three minigame modules hold the bonk texts —
 * 'WRONG FUSE' at the ramp among them. A name is guarded by what a player reads,
 * not by which package compiled it.
 *
 * `copy.json` cannot import a constant, so a joke line that needs to name a
 * product has to go through a `{placeholder}` and `fill()`. Naming it by hand is
 * exactly what this catches: 'GOLD DYNAMITE' was a fifth spelling of the
 * finished stick, sitting unrendered in the file waiting for a surface to draw
 * it.
 */
const OUTSIDE: Record<string, string> = {
    ...import.meta.glob('../../../../config/game/*.json', {
        query: '?raw',
        import: 'default',
        eager: true,
    }),
    ...import.meta.glob('../../../../game-server/src/sim/minigames/*.ts', {
        query: '?raw',
        import: 'default',
        eager: true,
    }),
};

/**
 * The code with its prose taken out. The comments are where these names are
 * *explained* — half the files below carry a paragraph about the spelling they
 * replaced — so scanning them would fail the guard for saying why it exists.
 */
function code(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// A key is relative to this file, so the tests themselves come back as './…'
// and everything the client actually ships as '../…'.
const FILES = [
    ...Object.entries(RAW)
        .filter(([path]) => path.startsWith('../') && !path.startsWith('../../'))
        .map(([path, source]) => ({ name: path.slice('../'.length), code: code(source) })),
    ...Object.entries(OUTSIDE).map(([path, source]) => ({
        name: path.replace(/^(\.\.\/)+/, ''),
        code: code(source),
    })),
];

/**
 * Which files write this name out. Bounded by non-identifier characters so the
 * constant that *holds* the name — `KEGS_OUT` contains `KEGS` — is not counted
 * as a second spelling of it; what is being hunted is the literal.
 */
function filesSaying(text: string): string[] {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const spelling = new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`, caseFlag(text));

    return FILES.filter((file) => spelling.test(file.code)).map((file) => file.name);
}

/**
 * A name with a space or a hyphen in it cannot be an identifier, so it is hunted
 * in any case — which is how `RACK_STAKE` got away with writing 'fuse set' out
 * in lower case for a whole feature. A single SHOUTY word is left case-sensitive
 * on purpose: `KEGS` is a guarded sign and `kegs:` is a field on half the view
 * objects in the client, and a guard that cannot tell them apart is one nobody
 * can keep green.
 */
function caseFlag(text: string): string {
    return /[^A-Za-z0-9_$]/.test(text) ? 'i' : '';
}

/**
 * One name, one home. Every other surface imports it, so a rename is one edit
 * and a second spelling is impossible rather than merely discouraged.
 */
const NAMED: { what: string; name: string; home: string }[] = [
    { what: 'the thing B fetches off the rack', name: FUSE_SET, home: 'nouns.ts' },
    { what: 'the gold keg', name: PRIME_KEG, home: 'nouns.ts' },
    { what: 'the hazard-striped drop zone', name: INTAKE_ZONE, home: 'nouns.ts' },
    { what: 'the board on the wall', name: ORDER_BOARD, home: 'nouns.ts' },
    { what: 'an empty book', name: NOTHING_ON_THE_BOARD, home: 'nouns.ts' },
    { what: 'a full pair of hands', name: HANDS_FULL, home: 'nouns.ts' },
    { what: 'a jig winding itself back', name: RE_ARMING, home: 'minigames/Jig.ts' },
    { what: 'a pile of kegs', name: pluralOf('keg'), home: 'render/dropTargets.ts' },
    { what: 'a pile of casings', name: pluralOf('casing'), home: 'render/dropTargets.ts' },
    { what: 'a pile of finished sticks', name: pluralOf('stick'), home: 'render/dropTargets.ts' },
    { what: 'a truck on its way in', name: 'TRUCK IN', home: 'nouns.ts' },
    { what: 'a truck on the clock', name: 'TRUCK LEAVES', home: 'nouns.ts' },
    { what: 'a truck already pulling out', name: TRUCK_LEAVING, home: 'nouns.ts' },
];

describe('one object, one name', () => {
    it.each(NAMED)('writes the name of $what in exactly one file', ({ name, home }) => {
        expect(filesSaying(name)).toEqual([home]);
    });
});

/**
 * `GROOVE` cannot be in the table above: it is one word, so the constant that
 * holds it is spelled exactly like the value and `filesSaying` counts every
 * file that imports it as a second spelling. The name still has one home — this
 * pins the two surfaces that draw it to that home instead.
 */
describe('the currency the bar measures', () => {
    it('is one word, defined once and read from there', () => {
        expect(GROOVE).toBe('GROOVE');
        expect(grooveBand(70, THRESHOLDS).label).toBe(`IN THE ${GROOVE}`);
    });
});

/**
 * The signs on the keg errand are not written down anywhere at all: three
 * sentences used to quote 'KEGS IN' and 'KEGS OUT' by hand while the paint on
 * the floor was built by `shelfLabel` from the level's own shelf. They agreed
 * only because every shipped level happens to accept kegs there.
 */
describe('the signs quote the paint', () => {
    /**
     * The IN sign is no longer a constant at all: N2 gave Assembly's shelf a third
     * claimant, so the one true spelling is whatever `shelfLabel` makes of the level
     * the round is running (`kegShelfSign`), and the three sentences that quote it
     * are handed that string. What stays pinned is the builder — and that no file
     * writes either sign out by hand.
     */
    it('builds both keg signs off the function that paints them', () => {
        expect(shelfLabel('in', ['keg'], null)).toBe('KEGS IN');
        expect(shelfLabel('in', ['keg', 'casing', 'parts'], null)).toBe('KEGS · FUSE SETS IN');
        expect(KEGS_OUT).toBe('KEGS OUT');
    });

    it.each(['KEGS IN', KEGS_OUT])('never spells %s out in a source file', (sign) => {
        expect(filesSaying(sign)).toEqual([]);
    });
});

/**
 * Spellings the game has already retired. Each of these was on a real surface
 * and was read by a real playtester as a different object from the one the next
 * surface named.
 */
const RETIRED: { spelling: RegExp; instead: string; exceptIn?: string[] }[] = [
    {
        spelling: /\bred[_ ]stick\b/i,
        instead: 'the recipe key, never the noun — use pluralOf',
        // The server's one legitimate use of the key: `Product` is a schema enum
        // and the dock needs a fallback value for an order it cannot find. It is
        // listed rather than regexed around, so the guard stays strong and the
        // exception has to be argued for the next time somebody adds one.
        exceptIn: ['game-server/src/sim/minigames/dock.ts'],
    },
    {
        spelling: /\bGOLD DYNAMITE\b/i,
        instead: `${pluralOf('stick')} — the gold is the prime keg's, not the stick's`,
    },
    { spelling: /\bPARTS\b/, instead: FUSE_SET },
    { spelling: /\bfuse kit\b/i, instead: FUSE_SET },
    { spelling: /\bPRIME BOOM\b/i, instead: PRIME_KEG },
    { spelling: /\bboom stick\b/i, instead: pluralOf('stick') },
    { spelling: /\bthe rep\b/i, instead: GROOVE },
    { spelling: /\bdrop zone\b/i, instead: INTAKE_ZONE },
    { spelling: /\bintake zone\b/i, instead: INTAKE_ZONE },
    { spelling: /\bDEAD CENTER\b/i, instead: `${PRIME_KEG} — the gold makes the prime keg` },
    { spelling: /\bNEXT TRUCK\b/i, instead: 'truckIn' },
    { spelling: /\bthe tray\b/i, instead: 'the sign painted on it, from shelfLabel' },
    { spelling: /\bBOOK\b/, instead: 'ORDERS — the board and the HUD count the same thing' },
];

describe('names the game has retired', () => {
    it.each(RETIRED)('never says $spelling again', ({ spelling, exceptIn }) => {
        const allowed = new Set(exceptIn ?? []);
        const offenders = FILES.filter(
            (file) => spelling.test(file.code) && !allowed.has(file.name),
        ).map((f) => f.name);

        expect(offenders).toEqual([]);
    });
});

/**
 * The floor signs are the game's dictionary — every count, every caption and
 * every plea is built out of `pluralOf` — so the whole table is pinned here
 * rather than one entry at a time in the module that happens to read it.
 */
describe('pluralOf is the dictionary', () => {
    it('gives every type one plural, in the schema type it is not', () => {
        expect(pluralOf('keg')).toBe('KEGS');
        expect(pluralOf('casing')).toBe('CASINGS');
        expect(pluralOf('stick')).toBe('STICKS');
        expect(pluralOf('crate')).toBe('CRATES');
        expect(pluralOf('parts')).toBe(`${FUSE_SET}S`);
    });
});
