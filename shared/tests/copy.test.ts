import { describe, expect, it } from 'vitest';

import { clipboardLines, copy, fill } from '../src/copy';

// The key lists contracts §8 names, spelled out here so the JSON cannot drift
// from the type without a test going red. §3 gives the banner union; §1 gives
// the wave-1 spark causes; §8 gives the chore, bubble, station, emote and
// report keys.
const BANNER_KEYS = [
    'WHOOPS',
    'INCIDENT',
    'EXPLODED',
    'NICE SAVE',
    'CLEAN SWEEP',
    'HOT STREAK',
    'TAILGATE',
] as const;
const CHORE_KEYS = ['unjam', 'sweep', 'stomp', 'repair'] as const;
const SPARK_CAUSES = ['slammerRedline', 'jammed', 'fizzle', 'crimpOnDented'] as const;
const BUBBLE_KEYS = ['whatCanIDo', 'whoThrewThat', 'sawTheHighway'] as const;
const STATION_KEYS = ['needHands', 'needParts'] as const;
const EMOTE_KEYS = ['stop', 'help', 'go', 'what'] as const;
const REPORT_KEYS = [
    'individualHeading',
    'factoryHeading',
    'topPerformer',
    'materials',
    'certificate',
    'repeatDay',
    'fireMarshal',
    'loss',
    'sandbox',
] as const;

function stringsIn(value: unknown, path: string): Array<[string, string]> {
    if (typeof value === 'string') return [[path, value]];
    if (Array.isArray(value)) return value.flatMap((entry, i) => stringsIn(entry, `${path}[${i}]`));
    if (value !== null && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, entry]) => stringsIn(entry, `${path}.${key}`));
    }
    return [];
}

describe('copy.json', () => {
    it('exposes every section the Copy type names', () => {
        expect(Object.keys(copy).sort()).toEqual(
            [
                'banners',
                'bubbles',
                'chores',
                'clipboard',
                'emotes',
                'events',
                'hazards',
                'report',
                'standupBubbles',
                'stations',
            ].sort()
        );
    });

    it('has a display line for every banner except the empty one', () => {
        expect(Object.keys(copy.banners).sort()).toEqual([...BANNER_KEYS].sort());
        expect(Object.keys(copy.banners)).not.toContain('');
    });

    it('has a label for every chore value', () => {
        expect(Object.keys(copy.chores).sort()).toEqual([...CHORE_KEYS].sort());
    });

    it('has a toast for every spark cause', () => {
        expect(Object.keys(copy.hazards.sparks).sort()).toEqual([...SPARK_CAUSES].sort());
    });

    it('has a bubble for every line a player says', () => {
        expect(Object.keys(copy.bubbles).sort()).toEqual([...BUBBLE_KEYS].sort());
    });

    it('has a bubble for every line a station says', () => {
        expect(Object.keys(copy.stations).sort()).toEqual([...STATION_KEYS].sort());
    });

    it('has a word for every emote', () => {
        expect(Object.keys(copy.emotes).sort()).toEqual([...EMOTE_KEYS].sort());
    });

    it('has every report line the report card draws', () => {
        expect(Object.keys(copy.report).sort()).toEqual([...REPORT_KEYS].sort());
    });

    it('gives the clipboard the four lines docs/02 writes', () => {
        expect(copy.clipboard).toEqual([
            'Onboarding… locating the good stapler…',
            'Reading the wiki page. The wiki page is wrong.',
            'Asking Dave. Dave is at lunch.',
            'Waiting for VPN.',
        ]);
    });

    it('has no empty strings anywhere in copy.json', () => {
        const blank = stringsIn(copy, 'copy')
            .filter(([, text]) => text.trim() === '')
            .map(([path]) => path);

        expect(blank).toEqual([]);
    });
});

describe('clipboardLines', () => {
    it("returns a level's own clipboard lines when it has them", () => {
        expect(clipboardLines({ copy: { clipboard: ['Reading the runbook. There is no runbook.'] } })).toEqual([
            'Reading the runbook. There is no runbook.',
        ]);
    });

    it('falls back to the global clipboard lines when the level has none', () => {
        expect(clipboardLines({})).toEqual(copy.clipboard);
        expect(clipboardLines({ copy: undefined })).toEqual(copy.clipboard);
    });

    it('falls back to the global clipboard lines when the level ships an empty list', () => {
        expect(clipboardLines({ copy: { clipboard: [] } })).toEqual(copy.clipboard);
    });
});

describe('fill', () => {
    it('fills every placeholder it is given', () => {
        expect(fill(copy.report.topPerformer, { name: 'Sam', station: 'Powder' })).toBe(
            'Top performer: Sam (Powder)'
        );
    });

    it('fills a numeric placeholder as its digits', () => {
        expect(fill(copy.report.materials, { purchased: 31, shipped: 8 })).toBe(
            'Materials purchased: 31 kegs. Materials shipped: 8.'
        );
    });

    it('leaves a placeholder with no value untouched', () => {
        expect(fill('Top performer: {name} ({station})', { name: 'Sam' })).toBe(
            'Top performer: Sam ({station})'
        );
    });

    it('leaves a template with no placeholders as written', () => {
        expect(fill(copy.banners.WHOOPS, { name: 'Sam' })).toBe('WHOOPS');
    });
});
