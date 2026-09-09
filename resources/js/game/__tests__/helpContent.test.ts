import { describe, expect, it } from 'vitest';

import { HELP_HINT, helpSections } from '../ui/helpContent';

function rowsOf(sections: ReturnType<typeof helpSections>): string[] {
    return sections.flatMap((s) => s.rows.map(([key, what]) => `${key} ${what}`));
}

describe('helpSections', () => {
    it('always explains how to walk and how to close the help', () => {
        const rows = rowsOf(helpSections(null)).join(' | ');

        expect(rows).toMatch(/WASD/i);
        expect(rows).toMatch(/walk/i);
        expect(rows).toMatch(/close/i);
    });

    it('leads with the station you are standing at, because that is what is unobvious', () => {
        const [first] = helpSections('boom_powder');

        expect(first?.title).toMatch(/slammer|powder/i);
    });

    it('teaches the Slammer as mash, charge, release', () => {
        const rows = rowsOf(helpSections('boom_powder')).join(' | ');

        expect(rows).toMatch(/mash/i);
        expect(rows).toMatch(/hold .*space/i);
        expect(rows).toMatch(/release/i);
        expect(rows).toMatch(/band|green/i);
    });

    it('warns that a late release sparks and a fourth mash spills', () => {
        const rows = rowsOf(helpSections('boom_powder')).join(' | ');

        expect(rows).toMatch(/spark/i);
        expect(rows).toMatch(/spill|overflow/i);
    });

    it('teaches the Jig as seat, pour, knots, crimp', () => {
        const rows = rowsOf(helpSections('assembly')).join(' | ');

        expect(rows).toMatch(/seat/i);
        expect(rows).toMatch(/pour|fill/i);
        expect(rows).toMatch(/knot/i);
        expect(rows).toMatch(/crimp/i);
    });

    it('teaches the Dock as set a stick then shove on the beep', () => {
        const rows = rowsOf(helpSections('dock')).join(' | ');

        expect(rows).toMatch(/lane|set/i);
        expect(rows).toMatch(/beep/i);
        expect(rows).toMatch(/tailgate|slam/i);
    });

    it('still lists the floor controls while you are at a station', () => {
        const titles = helpSections('dock').map((s) => s.title.toLowerCase());

        expect(titles.some((t) => /floor|anywhere/.test(t))).toBe(true);
    });

    it('offers a one-line hint naming the help key', () => {
        expect(HELP_HINT).toMatch(/H/);
        expect(HELP_HINT.length).toBeLessThan(40);
    });
});

describe('the flow section', () => {
    it('spells out powder to assembly to the dock, which the floor never says', () => {
        const flow = helpSections(null).find((s) => /where things go/i.test(s.title));
        const rows = flow?.rows.map(([k, v]) => `${k} ${v}`).join(' | ') ?? '';

        expect(rows).toMatch(/powder/i);
        expect(rows).toMatch(/assembly/i);
        expect(rows).toMatch(/dock|truck/i);
        expect(rows).toMatch(/light|glow/i);
    });
});
