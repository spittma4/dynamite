import type { StationType } from '@shared';

/** One line of help: the key (or keys) on the left, what it does on the right. */
export type HelpRow = readonly [string, string];

export interface HelpSection {
    title: string;
    rows: HelpRow[];
}

/** The nudge the HUD shows so nobody has to guess that help exists. */
export const HELP_HINT = 'H · help';

const FLOOR: HelpSection = {
    title: 'Anywhere on the floor',
    rows: [
        ['WASD / arrows', 'Walk. Carrying something slows you down.'],
        ['E', 'Pick up, put down, join a work tile, catch a throw, pull a lever.'],
        ['Space', 'Throw what you are carrying, two tiles ahead. Someone can catch it with E.'],
        ['Esc', 'Leave the station. You lose the cycle you were part-way through.'],
        ['Tab', 'The order board.'],
        ['Shift + arrows', 'Shout: ↑ HELP · ↓ STOP · ← GO BACK · → ?'],
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
            ['Release', 'Let go inside the green band. The gold line is a perfect keg.'],
            ['Watch out', 'Releasing late makes a damp keg and throws a spark onto the pile.'],
            ['Shelf full?', 'The keg lands in your hands. E puts it down; the machine waits until your hands are free.'],
        ],
    },
    assembly: {
        title: 'Assembly — the Jig',
        rows: [
            ['← →  then Space', 'Pick a casing off the shelf and seat it. Dented ones can never be perfect.'],
            ['Space', 'Pour: tap as the fill reaches the mark. A damp or dud keg pours slower.'],
            ['← or →', 'Knots: tap the lane each knot arrives on as it hits the eyelet.'],
            ['Space', 'Crimp: tap on the third ratchet click.'],
            ['At the rack', '← → pick short or long fuse, E to fetch, hold Space and release over the cradle.'],
        ],
    },
    dock: {
        title: 'The Dock',
        rows: [
            ['E', 'Set the stick you are carrying down on your ramp lane.'],
            ['Space', 'Shove — on the beep. Listen for it; the bay light flashes too.'],
            ['Missed it?', 'The crate stalls half way. Shove again on the next beep.'],
            ['Hold E', 'When the last slot fills, slam the tailgate and send the truck early.'],
        ],
    },
};

/**
 * Help for where the player is standing. The station they are at comes first,
 * because that is the part nobody can guess; the floor controls stay below it
 * so the two are never in separate screens.
 */
export function helpSections(station: StationType | null): HelpSection[] {
    if (station && STATIONS[station]) return [STATIONS[station], FLOOR];

    return [FLOOR];
}
