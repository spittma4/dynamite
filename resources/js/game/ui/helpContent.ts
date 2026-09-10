import type { EmoteKind, StationType } from '@shared';

import { FUSE_SET, INTAKE_ZONE, ORDER_BOARD, PRIME_KEG } from '../nouns';
import { KEGS_IN } from '../render/dropTargets';
import { type ArrowKey, emoteForArrow } from '../input/intent';
import { throwDistance } from './format';

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
 *
 * `Tab` rides along because nothing else on the HUD mentions it: the order
 * board — the answer to "what am I making" — was reachable only by opening help
 * first and reading down to the fifth floor row.
 */
export const HELP_HINT = 'H · what do I do?   ·   TAB · orders';

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

/**
 * The floor controls. The throw is the one row with a number in it, and the
 * number is `level.carry.throwTiles` — so it is read off the level here and on
 * the Slammer's hands panel alike. Hedging it in one place while the other
 * asserted 'two tiles' left the drift live on the surface nobody checked.
 */
function floorSection(throwTiles: number): HelpSection {
    return {
        title: 'Anywhere on the floor',
        rows: [
            ['WASD / arrows', 'Walk. Carrying something slows you down.'],
            ['E', 'Pick up, put down, join a work tile, catch a throw, pull a lever.'],
            [
                'Space',
                `Throw what you are carrying, ${throwDistance(throwTiles)} ahead. E catches it.`,
            ],
            ['Esc', 'Leave the station. You lose the cycle you were part-way through.'],
            ['Tab', `The ${ORDER_BOARD.toLowerCase()}.`],
            shoutRow(),
            // F18's three keys. They are also the gesture that unlocks the
            // audio, so a player who finds this row can always reach the sound
            // even if they have not touched anything else yet.
            ['M · [ ]', 'M mutes the sound. [ and ] move the volume. The top band shows the level.'],
            ['H', 'Close this help.'],
        ],
    };
}

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
            [
                'Release',
                `Let go on the gold line for a ${PRIME_KEG}. The orange band still counts \u2014 outside it the keg comes out damp or dud.`,
            ],
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
            // Lead with the channel everyone has. The panel is showing a needle
            // crossing a gold band 87 px wide; "the third ratchet click" named
            // an event only a hearing player can count.
            ['Space', 'Crimp: tap as the needle reaches the third click line.'],
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
            // 'Listen for it' is an instruction a deaf player cannot follow, and
            // the visual it offered instead — the bay strobe — is a 120 ms flash
            // that *starts* on the beep, so it carries no anticipation at all.
            // The marker is the better channel: a full second of lead-in across
            // bands drawn to the server's own windows.
            ['Space', 'Shove as the marker crosses the centre line. It beeps on it too.'],
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
            `Carry a keg into ${INTAKE_ZONE}, face the ${KEGS_IN} shelf and press E. A keg and a casing become a stick.`,
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
export function helpSections(station: StationType | null, throwTiles: number): HelpSection[] {
    const floor = floorSection(throwTiles);

    if (station && STATIONS[station]) return [STATIONS[station], FLOW, floor];

    return [FLOW, floor];
}
