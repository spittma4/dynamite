import { describe, expect, it } from 'vitest';

import { emoteForArrow, intentFrom, type PressedKeys } from '../input/intent';

function pressed(keys: Partial<PressedKeys> = {}): PressedKeys {
    return {
        w: false,
        a: false,
        s: false,
        d: false,
        up: false,
        down: false,
        left: false,
        right: false,
        shift: false,
        ...keys,
    };
}

describe('intentFrom', () => {
    it('maps WASD and arrows to dx/dy', () => {
        expect(intentFrom(pressed({ d: true }))).toEqual({ dx: 1, dy: 0 });
        expect(intentFrom(pressed({ a: true }))).toEqual({ dx: -1, dy: 0 });
        expect(intentFrom(pressed({ w: true }))).toEqual({ dx: 0, dy: -1 });
        expect(intentFrom(pressed({ s: true }))).toEqual({ dx: 0, dy: 1 });
        expect(intentFrom(pressed({ right: true, down: true }))).toEqual({ dx: 1, dy: 1 });
    });

    it('cancels opposite keys', () => {
        expect(intentFrom(pressed({ a: true, d: true }))).toEqual({ dx: 0, dy: 0 });
        expect(intentFrom(pressed({ w: true, down: true }))).toEqual({ dx: 0, dy: 0 });
    });

    it('excludes arrows from intent while Shift is held', () => {
        expect(intentFrom(pressed({ left: true, shift: true }))).toEqual({ dx: 0, dy: 0 });
        expect(intentFrom(pressed({ a: true, shift: true }))).toEqual({ dx: -1, dy: 0 });
    });
});

describe('emoteForArrow', () => {
    it('maps Shift+arrows to stop/help/go/what', () => {
        expect(emoteForArrow('left')).toBe('stop');
        expect(emoteForArrow('up')).toBe('help');
        expect(emoteForArrow('right')).toBe('go');
        expect(emoteForArrow('down')).toBe('what');
    });
});
