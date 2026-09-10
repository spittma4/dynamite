import type { EmoteKind, StationType } from '@shared';

import { FUSE_SET, INTAKE_ZONE, ORDER_BOARD, PRIME_KEG } from '../nouns';
import { pluralOf } from '../render/dropTargets';
import { POST_LABEL } from '../render/helperPosts';
import { type ArrowKey, emoteForArrow } from '../input/intent';
import { throwDistance } from './format';

/** One line of help: the key (or keys) on the left, what it does on the right. */
export type HelpRow = readonly [string, string];

export interface HelpSection {
    title: string;
    rows: HelpRow[];
}

/**
 * What the panel has to be told about the level this round is running. Both are
 * paint a player will be standing in front of, so neither may be a constant here.
 *
 * `assemblyShelf` used to be exactly that — `KEGS_IN`, built for `['keg']` — and N2
 * gave that shelf a third claimant, so the floor read KEGS · FUSE SETS IN while
 * this panel sent every player to a sign the floor does not have. It comes off
 * `kegShelfSign`, which is the same `shelfLabel` call that paints it.
 */
export interface HelpFacts {
    /** `level.carry.throwTiles` — the one number in the floor rows. */
    throwTiles: number;
    /** The IN sign on the machine a keg is carried to, as the floor paints it. */
    assemblyShelf: string;
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
            [
                '← →  then Space',
                'Seat a casing. The Jig stocks its own, so one is always waiting.',
            ],
            ['Space', 'Pour: tap as the fill reaches the mark. A damp or dud keg pours slower.'],
            ['← or →', 'Knots: tap the lane each knot arrives on as it hits the eyelet.'],
            // Lead with the channel everyone has. The panel is showing a needle
            // crossing a gold band 87 px wide; "the third ratchet click" named
            // an event only a hearing player can count.
            ['Space', 'Crimp: tap as the needle reaches the third click line.'],
            // N1: the dot on the chip was the least explained mark on the panel
            // and it decides the cycle twice over — `isPrimeStick` refuses on
            // `dents > 0` before it reads a grade, and a crimp miss on a dented
            // casing rolls `hazards.sparks.crimpOnDented`. The Slammer's rows have
            // always named their spark; the Jig's named neither of its own.
            [
                'A dented one',
                'The dimples on the chip. It can never be perfect, and a missed crimp on one throws a spark onto the pile.',
            ],
            [
                'At the rack',
                `The order picks the ${FUSE_SET.toLowerCase()} for you — the lit bin is the right one. ← short · → long to override. Hold Space to fetch and swing · release to toss it to A's cradle · ↓ banks it in the machine's own ${pluralOf('parts')} bin instead, which A reaches into while the phrase waits.`,
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
function flowSection(assemblyShelf: string): HelpSection {
    return {
        title: 'Start here — the line',
        rows: [
            [
                '1 · Boom Powder',
                'Start here. It makes the kegs, and every other station is waiting on one.',
            ],
            [
                '2 · Assembly',
                `Carry a keg into ${INTAKE_ZONE}, face the ${assemblyShelf} shelf and press E. A keg, a casing and a ${FUSE_SET.toLowerCase()} become a stick.`,
            ],
            // The casings are the part nobody fetches; the fuse set is not, and the
            // row used to say a keg was the only thing you carry here — which denied
            // N2's receptacle in the one panel a stuck player opens, and with it the
            // only way a lone operator ever arms the cradle: `partsOnJigTile` reads a
            // body that has *not* joined, so A can never load one from their own hands.
            [
                'Casings',
                `Never fetch them — Assembly stocks its own. The ${FUSE_SET.toLowerCase()} is the other thing you carry there: same shelf, same press, and it lands in the ${pluralOf('parts')} bin. It is the only way to arm the jig on your own.`,
            ],
            ['3 · The Dock', 'Walk the stick to a ramp lane and shove it onto the truck.'],
            // N4: the third way to join a machine, and the only one a player finds by
            // accident. The brackets only answer `E` once the machine is manned, and
            // whether another body helps is the staffing curve's business — so the row
            // promises the panel will say which, rather than claiming it always helps.
            [
                POST_LABEL,
                'The yellow brackets beside a machine somebody is already running. Press E there to lend a hand; the panel says whether you are helping or in the way. Step off the bracket to stop.',
            ],
            [
                'In your hands',
                'Every place with a job for what you are holding lights up. The bare floor takes anything, and charges you for it.',
            ],
        ],
    };
}

/**
 * The one system in the game with a countdown on it, and until now the only one
 * with no presence in the panel a stuck player is told to open. The Slammer's
 * rows introduce a spark and a pile and then leave both unexplained, and the two
 * gold tiles at the ends of the line refuse an unlit item without a word — so a
 * first-timer who guesses right and carries a keg over is silently refused for
 * doing the correct thing.
 *
 * No seconds in it. `hazards.fuseSeconds` is a per-level knob and the burning
 * fuse is already on screen counting itself down; a number written out here
 * would be a second copy nothing keeps in step.
 */
const FIRE: HelpSection = {
    title: 'When something catches',
    rows: [
        [
            'A lit keg or stick',
            'It burns down where it lies and then goes off, and everything piled in that machine\u2019s ring goes with it.',
        ],
        [
            'Space',
            'Stand on the burning tile with empty hands and press Space to stomp it out. It takes a moment, and you cannot move while you do.',
        ],
        [
            'BLAST BIN',
            'The gold tiles at each end of the line. Drop a burning item in and it is over. They take only what is already lit \u2014 an unlit keg is refused.',
        ],
    ],
};

/**
 * Help for where the player is standing. The station they are at comes first,
 * because that is the part nobody can guess; the floor controls stay below it
 * so the two are never in separate screens.
 */
export function helpSections(station: StationType | null, facts: HelpFacts): HelpSection[] {
    const floor = floorSection(facts.throwTiles);
    const flow = flowSection(facts.assemblyShelf);

    if (station && STATIONS[station]) return [STATIONS[station], flow, FIRE, floor];

    return [flow, FIRE, floor];
}
