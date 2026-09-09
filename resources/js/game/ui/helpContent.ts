import type { EmoteKind, StationType } from '@shared';

import { FUSE_SET } from '../minigames/Jig';
import { type ArrowKey, emoteForArrow } from '../input/intent';

/** One line of help: the key (or keys) on the left, what it does on the right. */
export type HelpRow = readonly [string, string];

export interface HelpSection {
    title: string;
    rows: HelpRow[];
}

/**
 * The nudge the HUD shows so nobody has to guess that help exists. It names the
 * question rather than the panel: a player stuck on "where does this keg go" does
 * not press a key labelled help, because help sounds like a list of keybinds.
 */
export const HELP_HINT = 'H · what do I do?';

const ARROW_GLYPH: Record<ArrowKey, string> = {
    up: '\u2191',
    down: '\u2193',
    left: '\u2190',
    right: '\u2192',
};

const SHOUT_WORD: Record<EmoteKind, string> = {
    help: 'HELP',
    stop: 'STOP',
    go: 'GO',
    what: '?',
};

/**
 * Read the shouts off the code that sends them. Written out by hand, this row
 * disagreed with `intent.ts` on three of the four arrows and taught a fourth
 * shout the game has no word for.
 */
function shoutRow(): HelpRow {
    const shouts = (['up', 'left', 'right', 'down'] as ArrowKey[]).map(
        (arrow) => `${ARROW_GLYPH[arrow]} ${SHOUT_WORD[emoteForArrow(arrow)]}`,
    );

    return ['Shift + arrows', `Shout: ${shouts.join(' \u00b7 ')}`];
}

const FLOOR: HelpSection = {
    title: 'Anywhere on the floor',
    rows: [
        ['WASD / arrows', 'Walk. Carrying something slows you down.'],
        ['E', 'Pick up, put down, join a work tile, catch a throw, pull a lever.'],
        // Not "two tiles": the distance is `carry.throwTiles`, a per-level knob.
        // Every shipped level is 2 today, so the count was not yet a lie — but it
        // is the same drift `shoutRow()` was rebuilt to make impossible.
        ['Space', 'Throw what you are carrying, a couple of tiles ahead. E catches it.'],
        ['Esc', 'Leave the station. You lose the cycle you were part-way through.'],
        ['Tab', 'The order board.'],
        shoutRow(),
        ['H', 'Close this help.'],
    ],
};

/**
 * What each station actually asks of you. The mini-games are deliberately
 * short, which also makes them easy to misread the first time — so each one
 * is spelled out as the sequence it really is, ending with what goes wrong.
 */
const STATIONS: Record<StationType, HelpSection> = {
    boom_powder: {
        title: 'Boom Powder — the Slammer',
        rows: [
            ['← ↑ →', 'Mash the three chutes, one each. A fourth press overflows and spills at your feet.'],
            ['Hold Space', 'Charge. The faster you mashed, the faster it climbs — and the tighter the window.'],
            ['Release', 'Let go inside the green band. The gold line is a PRIME keg.'],
            ['Watch out', 'Releasing late makes a damp keg and throws a spark onto the pile.'],
            [
                'Shelf full?',
                'The keg lands in your hands and the machine waits. Walk it to Assembly — a keg on the floor costs groove and feeds the next fire.',
            ],
        ],
    },
    assembly: {
        title: 'Assembly — the Jig',
        rows: [
            ['← →  then Space', 'Seat a casing. The Jig stocks its own, so one is always waiting. Dented ones can never be perfect.'],
            ['Space', 'Pour: tap as the fill reaches the mark. A damp or dud keg pours slower.'],
            ['← or →', 'Knots: tap the lane each knot arrives on as it hits the eyelet.'],
            ['Space', 'Crimp: tap on the third ratchet click.'],
            [
                'At the rack',
                `A ${FUSE_SET.toLowerCase()}: ← short · → long · hold Space to fetch and swing · release to toss it to A's cradle.`,
            ],
        ],
    },
    dock: {
        title: 'The Dock',
        rows: [
            ['E', 'Set the stick you are carrying down on your ramp lane.'],
            ['Space', 'Shove — on the beep. Listen for it; the bay light flashes too.'],
            // Was 'the crate'. Nothing in the game ever makes a crate: `laneStatus`
            // reports STALLED for a stick, and the sign on the lane says STICKS.
            ['Missed it?', 'The stick stalls half way. Shove again on the next beep.'],
            ['Hold E', 'When the last slot fills, slam the tailgate and send the truck early.'],
        ],
    },
};

/**
 * The first thing anybody reads, so it is an order of work rather than a
 * glossary. The old title named the subject and the first row described a
 * machine — five reads and forty words before a new player could learn which
 * of the three stations to walk to first, while all three shouted for hands.
 */
const FLOW: HelpSection = {
    title: 'Start here — the line',
    rows: [
        [
            '1 · Boom Powder',
            'Start here. It makes the kegs, and every other station is waiting on one.',
        ],
        [
            '2 · Assembly',
            'Carry a keg into the striped zone, face the KEGS IN shelf and press E. A keg and a casing become a stick.',
        ],
        [
            'Casings',
            'Never fetch them. Assembly stocks its own, so a keg is the only thing you carry to it.',
        ],
        ['3 · The Dock', 'Walk the stick to a ramp lane and shove it onto the truck.'],
        [
            'In your hands',
            'Every place with a job for what you are holding lights up. The bare floor takes anything, and charges you for it.',
        ],
    ],
};

/**
 * Help for where the player is standing. The station they are at comes first,
 * because that is the part nobody can guess; the floor controls stay below it
 * so the two are never in separate screens.
 */
export function helpSections(station: StationType | null): HelpSection[] {
    if (station && STATIONS[station]) return [STATIONS[station], FLOW, FLOOR];

    return [FLOW, FLOOR];
}
