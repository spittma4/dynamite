import { describe, expect, it } from 'vitest';

import { boardTitle, bookText, clockText, nudgeUnmutes, showsBook, soundReadout } from '../ui/Hud';
import { HELP_HINT } from '../ui/helpContent';
import { ORDER_BOARD } from '../nouns';

const RUNNING = { phase: 'running', clock: 65, shiftSeconds: 600, players: 3, minPlayers: 3 };

describe('clockText', () => {
    it('counts the shift down from shiftSeconds', () => {
        expect(clockText(RUNNING, false)).toBe('08:55');
    });

    it('clamps at zero when the client clock has run past the end', () => {
        expect(clockText({ ...RUNNING, clock: 700 }, false)).toBe('00:00');
    });

    it('counts elapsed time up in Sandbox, where the shift never ends', () => {
        expect(clockText({ ...RUNNING, shiftSeconds: 0, clock: 65 }, false)).toBe('01:05');
    });

    it('tells the host how to start the shift', () => {
        expect(clockText({ ...RUNNING, phase: 'lobby', players: 2 }, true)).toBe(
            'LOBBY · 2/3 players · ENTER starts the shift · best with 3+',
        );
    });

    it('tells everyone else who they are waiting for', () => {
        expect(clockText({ ...RUNNING, phase: 'lobby', players: 2 }, false)).toBe(
            'LOBBY · 2/3 players · waiting for the host · best with 3+',
        );
    });

    it('says the shift is over once the day has ended', () => {
        expect(clockText({ ...RUNNING, phase: 'ended' }, true)).toBe('SHIFT OVER');
    });
});

/**
 * 'BOOK' was a second player-facing name for the order list, defined nowhere
 * and said by nothing else in the client — and `boardTitle` printed it inside
 * the panel that already carries the name, so one line read
 * 'ORDER BOARD · BOOK 11/13'.
 */
describe('bookText', () => {
    it('counts what is left in the words the board uses', () => {
        expect(bookText(3, 8)).toBe('ORDERS 3/8');
    });

    it('never invents a second noun for the order list', () => {
        expect(bookText(3, 8)).not.toMatch(/\bbook\b/i);
    });
});

describe('boardTitle', () => {
    it('heads the board with how much of the book is left, and names it once', () => {
        expect(boardTitle(3, 8)).toBe(`${ORDER_BOARD} · 3/8 LEFT`);
        expect(boardTitle(3, 8)).not.toMatch(/\bbook\b/i);
    });

    it('counts nothing in Sandbox, where there is no book to count', () => {
        expect(boardTitle(0, 0)).toBe(ORDER_BOARD);
    });
});

/**
 * `bookTotal` is 0 until the whistle and 0 all day in Sandbox (contracts §3),
 * so before the shift starts the band read 'ORDERS 0/0' — a count of nothing,
 * sitting hard against the left edge of the lobby line, which at 1/1 players
 * runs the full width of the band.
 */
describe('showsBook', () => {
    it('counts a book only once there is one', () => {
        expect(showsBook(13)).toBe(true);
        expect(showsBook(0)).toBe(false);
    });

    it('agrees with the panel title about when there is nothing to count', () => {
        expect(showsBook(0)).toBe(false);
        expect(boardTitle(0, 0)).toBe(ORDER_BOARD);
        expect(showsBook(8)).toBe(true);
        expect(boardTitle(3, 8)).not.toBe(ORDER_BOARD);
    });
});

/**
 * The one string that rescues a lost first-timer. It was 11 px of #7a7d82 over
 * `UI.floor` — about 2.5:1 — and it named only `H`, so the order board was
 * reachable only by opening help first and reading down to the fifth row.
 */
describe('HELP_HINT', () => {
    it('carries both keys a stuck player needs', () => {
        expect(HELP_HINT).toMatch(/\bH\b/);
        expect(HELP_HINT).toMatch(/\bTAB\b/i);
    });
});

describe('clockText — small crews', () => {
    const lobby = { phase: 'lobby' as const, clock: 0, shiftSeconds: 600, players: 1, minPlayers: 1 };

    it('nudges toward a full crew when the shift can start under-staffed', () => {
        expect(clockText(lobby, true)).toMatch(/best with 3/i);
    });

    it('does not nag once three have shown up', () => {
        expect(clockText({ ...lobby, players: 3 }, true)).not.toMatch(/best with 3/i);
    });

    it('still counts players toward the gate when the crew is short of the minimum', () => {
        expect(clockText({ ...lobby, players: 2, minPlayers: 3 }, false)).toContain('2/3');
    });
});

/**
 * The readout is the visual counterpart for the audio control itself — the only
 * way a muted player can tell that the key did anything (F18 §5).
 */
describe('soundReadout', () => {
    it('prints the level as a percentage the volume keys can land on exactly', () => {
        expect(soundReadout({ volume: 0.7, muted: false })).toBe('SOUND 70%');
        expect(soundReadout({ volume: 0, muted: false })).toBe('SOUND 0%');
        expect(soundReadout({ volume: 1, muted: false })).toBe('SOUND 100%');
    });

    it('says off rather than a number while muted, because the number is not what is true', () => {
        expect(soundReadout({ volume: 0.7, muted: true })).toBe('SOUND OFF');
    });
});

/**
 * F18c left this policy to the surface that has a readout to explain it with.
 * Turning it up is a request to hear something, so it un-mutes; turning it down
 * is not, so it leaves the mute alone and only moves the stored level.
 */
describe('nudgeUnmutes', () => {
    it('un-mutes when a muted player asks for more', () => {
        expect(nudgeUnmutes(true, 1)).toBe(true);
    });

    it('leaves a muted player muted when they turn it down', () => {
        expect(nudgeUnmutes(true, -1)).toBe(false);
    });

    it('has nothing to do when the sound is already on', () => {
        expect(nudgeUnmutes(false, 1)).toBe(false);
        expect(nudgeUnmutes(false, -1)).toBe(false);
    });
});
