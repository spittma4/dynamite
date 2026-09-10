import type {
    DockMg,
    ItemType,
    JigBPhase,
    JigMg,
    JigPhase,
    MgOp,
    PlayerState,
    StationState,
    StationType,
} from '@shared';
import { describe, expect, it } from 'vitest';

import { POST_LABEL } from '../render/helperPosts';

import { type KeyEvents, Keys } from '../input/Keys';
import { dockKeyAction } from '../minigames/Dock';
import { bKeyOp, jigOverlay } from '../minigames/Jig';
import { FUSE_SET, PRIME_KEG } from '../nouns';
import { LEGEND, chuteFor, keyPlan, outcomeLabel } from '../minigames/Slammer';
import type { OverlayContext, OverlayKey } from '../minigames/types';
import { type ArrowKey, emoteForArrow } from '../input/intent';
import {
    HELP_HINT,
    type HelpFacts,
    type HelpRow,
    type HelpSection,
    helpSections,
} from '../ui/helpContent';
import { shelfLabel } from '../render/dropTargets';

/**
 * What the help panel is told about the level the round is running, in the values
 * every shipped level actually holds (`config/game/levels/*.json`): `throwTiles` 2,
 * and an Assembly input shelf that takes kegs, its own casings and — since N2 —
 * fuse sets. The shelf name is built by the same `shelfLabel` call that paints the
 * sign on the floor, so a row quoting it cannot name paint that is not there.
 */
const SHIPPED_ACCEPTS: ItemType[] = ['keg', 'casing', 'parts'];
const FACTS: HelpFacts = { throwTiles: 2, assemblyShelf: shelfLabel('in', SHIPPED_ACCEPTS, null) };

function rowsOf(sections: ReturnType<typeof helpSections>): string[] {
    return sections.flatMap((s) => s.rows.map(([key, what]) => `${key} ${what}`));
}

/**
 * The Slammer's rows introduce two nouns nobody else picks up — 'a spark' and
 * 'the pile' — and then no section anywhere said what to do about either. Fire
 * is the one system in this game with a countdown on it, and it had zero
 * presence in the panel a stuck player is told to open.
 */
describe('when something catches', () => {
    const rows = (): string => rowsOf(helpSections(null, FACTS)).join(' | ');

    it('says a lit item burns down and takes the pile with it', () => {
        expect(rows()).toMatch(/burn/i);
    });

    it('names the key that puts a fire out', () => {
        const fire = helpSections(null, FACTS).find((s) => /catch/i.test(s.title));
        const stomp = fire?.rows.find(([, what]) => /stomp/i.test(what));

        expect(stomp?.[0]).toMatch(/space/i);
    });

    /**
     * The two gold tiles are the only place a burning item can be made safe, and
     * `blockedForItems` refuses an unlit one with no explanation anywhere — so a
     * first-timer who guesses right and carries a normal keg over gets a wordless
     * refusal for doing the correct thing.
     */
    it('says a blast bin takes a burning item and nothing else', () => {
        const fire = helpSections(null, FACTS).find((s) => /catch/i.test(s.title));
        const bin = fire?.rows.find(([key]) => /blast bin/i.test(key));

        expect(bin?.[1]).toMatch(/only|nothing else|not.*unlit/i);
    });
});

describe('helpSections', () => {
    it('always explains how to walk and how to close the help', () => {
        const rows = rowsOf(helpSections(null, FACTS)).join(' | ');

        expect(rows).toMatch(/WASD/i);
        expect(rows).toMatch(/walk/i);
        expect(rows).toMatch(/close/i);
    });

    it('leads with the station you are standing at, because that is what is unobvious', () => {
        const [first] = helpSections('boom_powder', FACTS);

        expect(first?.title).toMatch(/slammer|powder/i);
    });

    it('teaches the Slammer as mash, charge, release', () => {
        const rows = rowsOf(helpSections('boom_powder', FACTS)).join(' | ');

        expect(rows).toMatch(/mash/i);
        expect(rows).toMatch(/hold .*space/i);
        expect(rows).toMatch(/release/i);
        expect(rows).toMatch(/band/i);
    });

    it('warns that a late release sparks and a fourth mash spills', () => {
        const rows = rowsOf(helpSections('boom_powder', FACTS)).join(' | ');

        expect(rows).toMatch(/spark/i);
        expect(rows).toMatch(/spill|overflow/i);
    });

    /**
     * The Slammer's rows say a late release "throws a spark onto the pile"; the
     * Jig's said nothing about the matching roll, and the Jig has one — a crimp
     * miss on a dented casing rolls `hazards.sparks.crimpOnDented`. The dent dot
     * was the least explained mark on the panel and it carries both consequences.
     */
    it('says a dented casing costs the perfect and can throw a spark', () => {
        const rows = helpSections('assembly', FACTS)[0]?.rows ?? [];
        const text = rows.map(([k, v]) => `${k} ${v}`).join(' | ');

        expect(text).toMatch(/dent/i);
        expect(text).toMatch(/never be perfect/i);
        expect(text).toMatch(/spark/i);
    });

    it('teaches the Jig as seat, pour, knots, crimp', () => {
        const rows = rowsOf(helpSections('assembly', FACTS)).join(' | ');

        expect(rows).toMatch(/seat/i);
        expect(rows).toMatch(/pour|fill/i);
        expect(rows).toMatch(/knot/i);
        expect(rows).toMatch(/crimp/i);
    });

    it('teaches the Dock as set a stick then shove on the beep', () => {
        const rows = rowsOf(helpSections('dock', FACTS)).join(' | ');

        expect(rows).toMatch(/lane|set/i);
        expect(rows).toMatch(/beep/i);
        expect(rows).toMatch(/tailgate|slam/i);
    });

    it('still lists the floor controls while you are at a station', () => {
        const titles = helpSections('dock', FACTS).map((s) => s.title.toLowerCase());

        expect(titles.some((t) => /floor|anywhere/.test(t))).toBe(true);
    });

    it('offers a one-line hint naming the help key', () => {
        expect(HELP_HINT).toMatch(/H/);
        expect(HELP_HINT.length).toBeLessThan(40);
    });

    // 'H · help' reads as a keybind list to a player whose problem is not which
    // key to press but what the job is — and the flow section is the answer.
    it('names the question the help answers, not just the word help', () => {
        expect(HELP_HINT).toMatch(/\?/);
    });
});

describe('the flow section', () => {
    it('spells out powder to assembly to the dock, which the floor never says', () => {
        const flow = helpSections(null, FACTS).find((s) => /the line/i.test(s.title));
        const rows = flow?.rows.map(([k, v]) => `${k} ${v}`).join(' | ') ?? '';

        expect(rows).toMatch(/powder/i);
        expect(rows).toMatch(/assembly/i);
        expect(rows).toMatch(/dock|truck/i);
        expect(rows).toMatch(/light|glow/i);
    });

    // The one thing the floor cannot say: casings are stocked by the Jig itself
    // (`feed()` in shared/src/sim/jig.ts), so a player who goes looking for them
    // is looking for something that does not exist anywhere on the floor.
    it('says the casings are automatic, so nobody goes hunting for them', () => {
        const flow = helpSections(null, FACTS).find((s) => /the line/i.test(s.title));
        const rows = flow?.rows.map(([k, v]) => `${k} ${v}`).join(' | ') ?? '';

        expect(rows).toMatch(/casing/i);
        expect(rows).toMatch(/itself|its own|automatic|never fetch|never carry/i);
    });
});

/**
 * The panel quotes two signs that are painted on the floor by `shelfLabel` out of
 * the level's own `inputShelf.accepts`, and it used to quote them from a constant
 * built for `['keg']`. N2 gave that shelf a third claimant, so the floor started
 * reading KEGS · FUSE SETS IN while the panel still sent all three players to a
 * KEGS IN that does not exist. The row is built from the same string the floor is.
 */
describe('the signs the flow section quotes', () => {
    const assemblyRow = (): string => {
        const flow = helpSections(null, FACTS).find((s) => /the line/i.test(s.title));
        const row = flow?.rows.find(([key]) => /assembly/i.test(key));

        return row ? row.join(' ') : '';
    };

    it('names the shelf the floor actually paints, whatever the level accepts', () => {
        expect(assemblyRow()).toContain(FACTS.assemblyShelf);
        expect(assemblyRow()).toContain(shelfLabel('in', SHIPPED_ACCEPTS, null));
    });

    it('follows the level rather than a constant, when the level takes only kegs', () => {
        const kegsOnly = { ...FACTS, assemblyShelf: shelfLabel('in', ['keg'], null) };
        const flow = helpSections(null, kegsOnly).find((s) => /the line/i.test(s.title));
        const row = flow?.rows.find(([key]) => /assembly/i.test(key));

        expect(row?.join(' ')).toContain('KEGS IN');
        expect(row?.join(' ')).not.toContain(FACTS.assemblyShelf);
    });
});

/**
 * Major: the panel denied the feature N2 added. 'Assembly stocks its own, so a keg
 * is the only thing you carry to it' was written when it was true; afterwards a
 * fuse set was the second thing you carry there, and for a lone player loading the
 * bin is the only way to arm the cradle at all — `partsOnJigTile` reads a body that
 * has NOT joined, so an operator can never satisfy the hands path themselves. The
 * one panel a stuck solo player is told to open was telling them it was impossible.
 */
describe('what the panel says you carry to Assembly', () => {
    const rows = (station: 'assembly' | null): string =>
        rowsOf(helpSections(station, FACTS)).join(' | ');

    it('never claims a keg is the only thing carried to the machine', () => {
        expect(rows(null)).not.toMatch(/only thing you carry/i);
        expect(rows('assembly')).not.toMatch(/only thing you carry/i);
    });

    it('still says the casings are the part nobody fetches', () => {
        expect(rows(null)).toMatch(/casing/i);
        expect(rows(null)).toMatch(/never fetch/i);
    });

    it('names the fuse set as something you can carry to the bin yourself', () => {
        expect(rows('assembly')).toMatch(new RegExp(`carry.*${FUSE_SET}|${FUSE_SET}.*carry`, 'i'));
        expect(rows('assembly')).toMatch(/alone|on your own|by yourself/i);
    });

    it('keeps the relay as the other half of the row, so the pair still reads as a pair', () => {
        expect(rows('assembly')).toMatch(/toss/i);
        expect(rows('assembly')).toMatch(/cradle/i);
    });
});

/**
 * N4: "you can 'sit'/press E and get stuck on the squares around a station." The
 * floor brackets and the helper panel both teach this now, but the panel a stuck
 * player is told to open had nothing at all to say about the third way to join a
 * machine — and that is the one a player finds by pressing E somewhere odd.
 */
describe('the flow section on lending a hand', () => {
    const flow = (): string => {
        const section = helpSections(null, FACTS).find((s) => /the line/i.test(s.title));

        return section?.rows.map(([k, v]) => `${k} ${v}`).join(' | ') ?? '';
    };

    it('names the mark on the floor with the word painted on it', () => {
        expect(flow()).toContain(POST_LABEL);
    });

    it('says the machine has to be running before the press is answered', () => {
        expect(flow()).toMatch(/somebody is (already )?running|already working|being worked/i);
    });

    it('says how to stop helping, because walking off is the leave nobody guesses', () => {
        expect(flow()).toMatch(/step off|walk off/i);
    });
});

describe('the promise the flow section makes about the lighting', () => {
    function inYourHands(): string {
        const flow = helpSections(null, FACTS).find((section) => /the line/i.test(section.title));
        const row = flow?.rows.find(([key]) => /in your hands/i.test(key));

        return row ? row.join(' ') : '';
    }

    /**
     * The intake stopped lighting for a casing: the shelf takes one back, but
     * nobody is ever sent for one, so `acceptsAt` advertises only the haulable
     * inputs (`render/dropTargets.ts`). A row promising a light for every zone
     * that *would take* the item over-promised by exactly that case — the hints
     * mark errands, so the row promises errands.
     */
    it('promises a light for the errands, not for everywhere an item would be legal', () => {
        expect(inYourHands()).toMatch(/light/i);
        expect(inYourHands()).not.toMatch(/will take what you are holding/i);
    });
});

describe('the Boom Powder section', () => {
    /**
     * A keg set on the floor costs groove (`floorItem: -0.5`) and is hazard fuel
     * (`hazards.fuel.floorKeg`). The one place the game brought that decision up
     * answered it with "E puts it down".
     */
    it('sends a full shelf keg to Assembly rather than onto the floor', () => {
        const row = helpSections('boom_powder', FACTS)[0]?.rows.find(([key]) => /shelf full/i.test(key));

        expect(row?.[1]).toMatch(/assembly/i);
        expect(row?.[1]).toMatch(/floor|fire|groove/i);
    });
});

describe('the Assembly section', () => {
    it('does not send you off to find a casing the machine stocks for itself', () => {
        const rows = rowsOf(helpSections('assembly', FACTS)).join(' | ');

        expect(rows).toMatch(/seat/i);
        expect(rows).toMatch(/itself|its own|already there|stocked/i);
        expect(rows).not.toMatch(/pick a casing off the shelf/i);
    });
});

describe('the shout row', () => {
    const GLYPH: Record<ArrowKey, string> = { up: '\u2191', down: '\u2193', left: '\u2190', right: '\u2192' };
    const WORD = { help: 'HELP', stop: 'STOP', go: 'GO', what: '?' } as const;

    function shoutRow(): string {
        return rowsOf(helpSections(null, FACTS)).find((row) => /Shout/.test(row)) ?? '';
    }

    // The help panel shipped a mapping that disagreed with `intent.ts` on three
    // of the four arrows, and taught a shout ('GO BACK') the game cannot send.
    // Pin the text to the code that actually sends the emote, not to a copy of it.
    it.each(['up', 'down', 'left', 'right'] as ArrowKey[])(
        'names the shout %s actually sends',
        (arrow) => {
            expect(shoutRow()).toContain(`${GLYPH[arrow]} ${WORD[emoteForArrow(arrow)]}`);
        },
    );

    it('does not teach a shout that does not exist', () => {
        expect(shoutRow()).not.toMatch(/GO BACK/);
    });
});

/**
 * Every key the help names, aimed at the code that will actually receive it.
 * The row that sent this file's author here read "E to fetch" for the fuse
 * rack: `jigOverlay.onKey` hands `E` straight back, and F05 reads a hand-back
 * at a work tile as a leave (`onInteract`, game-server/src/sim/stations.ts), so
 * the one row a stuck player reads walked them off the station. A row cannot be
 * checked against a copy of the key map — it has to be checked against the map.
 */

const KEY_TOKENS: [OverlayKey, RegExp][] = [
    ['left', /←/],
    ['right', /→/],
    ['up', /↑/],
    ['down', /↓/],
    ['space', /\bspace\b/i],
    ['interact', /(?<![A-Za-z])E(?![A-Za-z])/],
    ['esc', /\besc\b/i],
];

/** The keys one row tells the player to press, read out of the row itself. */
function keysNamedIn(row: HelpRow): OverlayKey[] {
    const said = `${row[0]} ${row[1]}`;

    return KEY_TOKENS.filter(([, token]) => token.test(said)).map(([key]) => key);
}

function sectionFor(station: StationType): HelpSection {
    const section = helpSections(station, FACTS)[0];

    if (!section) throw new Error(`no help section for ${station}`);

    return section;
}

function rowSaying(station: StationType, what: RegExp): HelpRow {
    const row = sectionFor(station).rows.find(([key, says]) => what.test(`${key} ${says}`));

    if (!row) throw new Error(`no ${station} row saying ${String(what)}`);

    return row;
}

/** A Phaser object that answers every call it is not asked about with itself. */
function stub(target: Record<string, unknown>): Record<string, unknown> {
    const proxy: Record<string, unknown> = new Proxy(target, {
        get: (obj, prop) => (prop in obj ? obj[prop as string] : () => proxy),
    });

    return proxy;
}

/**
 * The real Jig overlay on a stub panel. The level carries no assembly station,
 * so `update` parses `mg` and returns before it draws anything — which is all
 * `onKey` needs, and leaves the key map as the only thing under test.
 */
function jigPanel(
    state: Partial<JigMg>,
    sessionId: string,
): { ops: MgOp[]; press: (key: OverlayKey, down?: boolean) => boolean } {
    const ops: MgOp[] = [];
    const station = {
        mg: JSON.stringify(state),
        state: 'running',
        inputShelf: ['c-1'],
        inputCap: 8,
    };
    const ctx = stub({
        scene: stub({
            add: stub({ text: () => stub({}), graphics: () => stub({}) }),
            conn: { config: { level: { stations: [], recipes: {} } } },
        }),
        container: stub({}),
        width: 896,
        height: 192,
        stationId: 'assembly',
        sessionId,
        state: {
            stations: new Map([['assembly', station]]),
            items: new Map([['c-1', { type: 'casing', dents: 0 }]]),
        },
        serverClock: () => 10,
        send: (op: MgOp) => {
            ops.push(op);
        },
    }) as unknown as OverlayContext;
    const overlay = jigOverlay();

    overlay.mount(ctx);
    overlay.update(
        station as unknown as StationState,
        { carrying: '' } as unknown as PlayerState,
        10,
    );

    return { ops, press: (key, down = true) => overlay.onKey(key, down, false) };
}

function atTheJig(phase: JigPhase): ReturnType<typeof jigPanel> {
    return jigPanel({ a: 'A1', b: 'B1', phase, bPhase: 'idle' }, 'A1');
}

function atTheRack(bPhase: JigBPhase): ReturnType<typeof jigPanel> {
    return jigPanel({ a: 'A1', b: 'B1', phase: 'parts', bPhase }, 'B1');
}

describe('the keys the Assembly section names', () => {
    /**
     * The blocker. A key the overlay declines falls through to the floor, and
     * the floor's `E` at a work tile is a leave — so a row that names one is
     * teaching the player to abandon the cycle they are half way through.
     */
    it('never teaches a key the jig panel hands back to the floor', () => {
        for (const row of sectionFor('assembly').rows.filter(([key]) => !/rack/i.test(key))) {
            for (const key of keysNamedIn(row)) {
                expect({ row: row[0], key, taken: atTheJig('seat').press(key) }).toEqual({
                    row: row[0],
                    key,
                    taken: true,
                });
            }
        }
    });

    it('never teaches a key the rack panel hands back to the floor', () => {
        for (const key of keysNamedIn(rowSaying('assembly', /rack/i))) {
            expect({ key, taken: atTheRack('idle').press(key) }).toEqual({ key, taken: true });
        }
    });

    it.each([
        [/seat a casing/i, 'seat' as JigPhase, 'seat' as MgOp],
        [/pour/i, 'pour' as JigPhase, 'pour' as MgOp],
        [/knots/i, 'knots' as JigPhase, 'knot' as MgOp],
        [/crimp/i, 'crimp' as JigPhase, 'crimp' as MgOp],
    ])('teaches %s with a key that really sends it', (says, phase, op) => {
        const panel = atTheJig(phase);

        for (const key of keysNamedIn(rowSaying('assembly', says))) panel.press(key);

        expect(panel.ops).toContain(op);
    });

    /**
     * B's whole key map is one key, held: down fetches, down again once the set
     * is in hand swings, and the release tosses it. The row has to name that key
     * — `E` is not any part of it.
     */
    it('teaches the rack with the key that fetches a fuse set', () => {
        const row = rowSaying('assembly', /rack/i);
        const panel = atTheRack('idle');

        for (const key of keysNamedIn(row)) panel.press(key);

        expect(panel.ops).toContain(bKeyOp('idle', true));
        expect(panel.ops).toContain('fetch');
    });

    it('teaches the swing and the toss the same key finishes the errand with', () => {
        const row = rowSaying('assembly', /rack/i).join(' ');

        expect(bKeyOp('holding', true)).toBe('swing');
        expect(bKeyOp('swinging', false)).toBe('toss');
        expect(row).toMatch(/swing/i);
        expect(row).toMatch(/toss|cradle/i);
    });

    it('picks the fuse length with the keys the rack picks it with', () => {
        const picks = atTheRack('idle');

        for (const key of ['left', 'right'] as OverlayKey[]) picks.press(key);

        expect(picks.ops.filter((op) => op === 'pick')).toHaveLength(2);
        expect(rowSaying('assembly', /rack/i).join(' ')).toMatch(/short/i);
    });
});

describe('the keys the Boom Powder section names', () => {
    it('names every chute the plunger has and nothing that is not one', () => {
        const named = keysNamedIn(rowSaying('boom_powder', /mash/i));
        const chutes = KEY_TOKENS.map(([key]) => key).filter((key) => chuteFor(key) !== null);

        expect([...named].sort()).toEqual([...chutes].sort());
    });

    it('never teaches a key the plunger hands back to the floor', () => {
        for (const row of sectionFor('boom_powder').rows) {
            for (const key of keysNamedIn(row)) {
                expect({ key, plan: keyPlan('mash', key, true, false).kind }).not.toEqual({
                    key,
                    plan: 'ignore',
                });
            }
        }
    });

    it('teaches the charge and the release as the two halves of one press', () => {
        expect(keyPlan('mash', 'space', true, false)).toEqual({ kind: 'send', op: 'charge' });
        expect(keyPlan('charge', 'space', false, false)).toEqual({ kind: 'send', op: 'release' });
        expect(keysNamedIn(rowSaying('boom_powder', /charge/i))).toContain('space');
    });
});

describe('the keys the Dock section names', () => {
    const DOCKED = {
        truck: { phase: 'docked', arrivesAt: 20, leavesAt: 40, slots: 8, loaded: 0, hits: '' },
        lanes: [{ itemId: 's-1', stalled: false, tile: [22, 4] }],
        beepAt: 20,
        beepPeriodMs: 1000,
        windows: { perfectMs: 70, okMs: 180 },
        tailgateUntil: 0,
        returnsTile: [19, 12],
    } as unknown as DockMg;

    it('shoves with the key that shoves', () => {
        expect(keysNamedIn(rowSaying('dock', /shove/i))).toContain('space');
        expect(dockKeyAction('space', true, DOCKED, 0, false, 10)).toBe('shove');
    });

    /**
     * The dock's `E` is the one row that is *about* the fall-through: the
     * overlay declines the press so F06's plain interact reaches the lane
     * (`dockKeyAction`). So the row may name `E` — as long as what it promises
     * is the put-down, not a shove.
     */
    it('sets a stick down with a key the overlay leaves to the floor', () => {
        const row = rowSaying('dock', /down on your ramp lane/i);

        expect(keysNamedIn(row)).toEqual(['interact']);
        expect(dockKeyAction('interact', true, DOCKED, 0, false, 10)).toBe('none');
    });

    it('slams the tailgate with the same key, once the tailgate is open', () => {
        const open = { ...DOCKED, tailgateUntil: 30 } as DockMg;
        const row = rowSaying('dock', /tailgate/i);

        expect(keysNamedIn(row)).toEqual(['interact']);
        expect(dockKeyAction('interact', true, open, 0, false, 10)).toBe('tailgate-down');
        expect(row.join(' ')).toMatch(/hold/i);
    });
});

describe('the first thing a new player reads', () => {
    function flow(): HelpSection {
        const section = helpSections(null, FACTS).find((s) => /the line/i.test(s.title));

        if (!section) throw new Error('the help has no flow section');

        return section;
    }

    /**
     * At the whistle three stations shouted the same plea and the panel behind
     * the H key was a glossary: the first row described Boom Powder without ever
     * saying to go there. Forty words before the first press.
     */
    it('opens with an instruction, not with a description of a machine', () => {
        const [first] = flow().rows;

        expect(flow().title.toLowerCase()).toMatch(/start/);
        expect(first?.join(' ').toLowerCase()).toMatch(/start here/);
        expect(first?.join(' ')).toMatch(/Boom Powder/i);
    });

    it('numbers the three stations so the order is readable at a glance', () => {
        const keys = flow().rows.map(([key]) => key);

        expect(keys.some((key) => key.startsWith('1'))).toBe(true);
        expect(keys.some((key) => key.startsWith('2'))).toBe(true);
        expect(keys.some((key) => key.startsWith('3'))).toBe(true);
    });

    /**
     * `putDownItem` shelves onto the tile the player is FACING, and the striped
     * apron is two tiles — the shelf and the aisle you stand in. Standing in the
     * zone is only half of it.
     */
    it('says which way to be looking when the keg goes down', () => {
        const row = flow().rows.find(([key]) => /assembly/i.test(key));

        expect(row?.join(' ')).toMatch(/face/i);
        expect(row?.join(' ')).toContain(FACTS.assemblyShelf);
    });
});

describe('the nouns the help teaches', () => {
    // There is no crate. Nothing in the server ever calls `createItem(world,
    // 'crate', ...)`, and the one help row that describes a failure invented an
    // object the game cannot make.
    it('calls the thing that stalls on the ramp a stick', () => {
        const row = rowSaying('dock', /missed/i);

        expect(row.join(' ')).toMatch(/stick/i);
        expect(rowsOf(helpSections('dock', FACTS)).join(' ')).not.toMatch(/crate/i);
    });

    it('calls the thing B fetches a fuse set, the word the panel uses', () => {
        expect(rowSaying('assembly', /rack/i).join(' ').toLowerCase()).toContain(
            FUSE_SET.toLowerCase(),
        );
    });

    /**
     * The Slammer congratulates a gold release with a word the help never
     * taught: the row said 'a perfect keg' and the verdict says PRIME KEG.
     * `dead_center` is the gold — the release `kegFor` gives `prime: true`.
     */
    it('teaches the word the verdict will actually use for a gold release', () => {
        const row = rowSaying('boom_powder', /release/i).join(' ');

        expect(outcomeLabel('dead_center', 0)).toBe(PRIME_KEG);
        expect(row).toContain('PRIME');
        expect(row).not.toMatch(/perfect keg/i);
    });

    /**
     * The first instruction a first-time player reads, at the first station in
     * the line, named a colour the gauge has never painted. `drawGauge` fills
     * red, orange and gold; green is the plunger bar and the verdict word. The
     * always-on legend three lines away already said 'release on the gold'.
     */
    it('names the bands the gauge is actually painted in', () => {
        const row = rowSaying('boom_powder', /release/i).join(' ');

        expect(row).toMatch(/gold/i);
        expect(row).toMatch(/orange/i);
        expect(row).not.toMatch(/green/i);
        expect(LEGEND).toMatch(/gold/i);
    });
});

/**
 * The floor rows name keys the overlays deliberately hand back, so the station
 * audit above has the wrong polarity for them — and they were the only rows
 * outside any coupling at all. They are checked against the thing that really
 * receives them: `Keys`, and the floor event each row promises.
 */
describe('the keys the floor sections name', () => {
    const FLOOR_BINDINGS: Record<string, { code: string; event: keyof KeyEvents }> = {
        E: { code: 'E', event: 'interact' },
        Space: { code: 'SPACE', event: 'action' },
        Esc: { code: 'ESC', event: 'leave' },
        Tab: { code: 'TAB', event: 'board' },
        H: { code: 'H', event: 'help' },
    };

    class FakeEmitter {
        readonly handlers = new Map<string, Array<(...args: never[]) => void>>();

        on(event: string, fn: (...args: never[]) => void): this {
            const list = this.handlers.get(event) ?? [];

            list.push(fn);
            this.handlers.set(event, list);

            return this;
        }

        off(): this {
            return this;
        }

        emit(event: string, ...args: unknown[]): void {
            for (const fn of [...(this.handlers.get(event) ?? [])]) {
                (fn as (...a: unknown[]) => void)(...args);
            }
        }
    }

    /** Presses one key on a real `Keys` and reports which floor events fired. */
    function fired(code: string): string[] {
        const keyboard = Object.assign(new FakeEmitter(), { addCapture: () => {} });
        const scene = {
            input: { keyboard },
            game: { events: new FakeEmitter() },
        } as unknown as Phaser.Scene;
        const keys = new Keys(scene, false);
        const seen: string[] = [];

        for (const event of Object.values(FLOOR_BINDINGS).map((b) => b.event)) {
            keys.on(event, (() => seen.push(event)) as never);
        }

        keyboard.emit(`keydown-${code}`, { repeat: false });

        return seen;
    }

    /** Both floor sections: the flow describes floor presses too. */
    function floorRows(): HelpRow[] {
        return helpSections(null, FACTS).flatMap((section) => section.rows);
    }

    it('binds every key the floor rows name to the action the row promises', () => {
        let checked = 0;

        for (const row of floorRows()) {
            for (const [name, binding] of Object.entries(FLOOR_BINDINGS)) {
                if (!new RegExp(`(?<![A-Za-z])${name}(?![A-Za-z])`).test(row.join(' '))) continue;

                checked += 1;
                expect({ row: row[0], name, fired: fired(binding.code) }).toEqual({
                    row: row[0],
                    name,
                    fired: [binding.event],
                });
            }
        }

        expect(checked).toBeGreaterThan(0);
    });

    it('gives every one of those five keys a row of its own', () => {
        const keys = helpSections(null, FACTS)
            .flatMap((section) => section.rows)
            .map(([key]) => key);

        for (const name of Object.keys(FLOOR_BINDINGS)) {
            expect({ name, listed: keys.includes(name) }).toEqual({ name, listed: true });
        }
    });
});
