import { describe, expect, it } from 'vitest';

import { bookText, clockText, compareOrderIds } from '../ui/Hud';

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
            'LOBBY · 2/3 players · ENTER starts the shift',
        );
    });

    it('tells everyone else who they are waiting for', () => {
        expect(clockText({ ...RUNNING, phase: 'lobby', players: 2 }, false)).toBe(
            'LOBBY · 2/3 players · waiting for the host',
        );
    });

    it('says the shift is over once the day has ended', () => {
        expect(clockText({ ...RUNNING, phase: 'ended' }, true)).toBe('SHIFT OVER');
    });
});

describe('bookText', () => {
    it('reads remaining over total', () => {
        expect(bookText(3, 8)).toBe('BOOK 3/8');
    });
});

describe('compareOrderIds', () => {
    it('reads the book in number order, not string order', () => {
        const ids = ['o-10', 'o-2', 'o-1', 'o-11', 'o-3'];

        expect([...ids].sort(compareOrderIds)).toEqual(['o-1', 'o-2', 'o-3', 'o-10', 'o-11']);
    });

    it('falls back to string order for an id that carries no number', () => {
        expect(compareOrderIds('order-a', 'order-b')).toBeLessThan(0);
        expect(compareOrderIds('o-4', 'o-4')).toBe(0);
    });
});
