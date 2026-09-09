import { describe, expect, it } from 'vitest';

import { fixed, mmss, pct } from '../ui/format';

describe('mmss', () => {
    it('formats 600 as 10:00 and 65 as 01:05 and clamps negatives to 00:00', () => {
        expect(mmss(600)).toBe('10:00');
        expect(mmss(65)).toBe('01:05');
        expect(mmss(-3)).toBe('00:00');
    });

    it('floors fractional seconds', () => {
        expect(mmss(59.9)).toBe('00:59');
    });

    it('keeps counting past an hour in minutes', () => {
        expect(mmss(3_672)).toBe('61:12');
    });
});

describe('pct', () => {
    it('renders a 0-1 fraction as a whole percentage', () => {
        expect(pct(0.925)).toBe('93%');
        expect(pct(0)).toBe('0%');
        expect(pct(1)).toBe('100%');
    });
});

describe('fixed', () => {
    it('renders a number with the requested decimals', () => {
        expect(fixed(1.2345, 2)).toBe('1.23');
        expect(fixed(4, 1)).toBe('4.0');
    });
});
