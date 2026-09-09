import type { LevelConfig, OrderState } from '@shared';
import { describe, expect, it } from 'vitest';

import { bookText, boardRow, clockText, compareOrderIds } from '../ui/Hud';

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
 * The `Tab` board printed `OrderState.product` raw, so it read
 * 'o-1  red_stick  0/7  open' — the recipe key, in snake_case, on a panel, and
 * a fourth name for the object every other surface calls a stick.
 */
describe('boardRow', () => {
    const RECIPES = {
        keg: { station: 'boom_powder', inputs: {}, output: { type: 'keg', pours: 2 } },
        red_stick: {
            station: 'assembly',
            inputs: { casing: 1 },
            output: { type: 'stick', product: 'red_stick' },
        },
    } as unknown as LevelConfig['recipes'];

    const ORDER = { product: 'red_stick', shipped: 0, qty: 7, status: 'open' } as OrderState;

    it('names the product the way the floor signs name it', () => {
        expect(boardRow('o-1', ORDER, RECIPES)).toBe('o-1  STICK  0/7  open');
    });

    it('never lets the recipe key itself reach the panel', () => {
        expect(boardRow('o-1', ORDER, RECIPES)).not.toContain('red_stick');
    });
});
