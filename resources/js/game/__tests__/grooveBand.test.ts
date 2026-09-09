import { describe, expect, it } from 'vitest';

import { grooveBand } from '../ui/grooveBand';

const thresholds = { onFire: 85, groove: 70, churn: 30, meltdown: 10 };

describe('grooveBand', () => {
    it('returns onFire at 85 and above', () => {
        expect(grooveBand(85, thresholds).band).toBe('onFire');
        expect(grooveBand(100, thresholds).label).toBe('ON FIRE');
        expect(grooveBand(92, thresholds).colour).toBe(0xf5c542);
    });

    it('returns groove from 70 to 84', () => {
        expect(grooveBand(70, thresholds).band).toBe('groove');
        expect(grooveBand(84, thresholds).label).toBe('IN THE GROOVE');
        expect(grooveBand(84, thresholds).colour).toBe(0x4cb944);
    });

    it('returns baseline strictly between churn and groove', () => {
        expect(grooveBand(31, thresholds).band).toBe('baseline');
        expect(grooveBand(69, thresholds).band).toBe('baseline');
        expect(grooveBand(50, thresholds).label).toBe('');
        expect(grooveBand(50, thresholds).colour).toBe(0x9a9a9a);
    });

    it('returns churn at 30 and below down to 11', () => {
        expect(grooveBand(30, thresholds).band).toBe('churn');
        expect(grooveBand(11, thresholds).label).toBe('THE CHURN');
        expect(grooveBand(30, thresholds).colour).toBe(0xd9463d);
    });

    it('returns meltdown at 10 and below', () => {
        expect(grooveBand(10, thresholds).band).toBe('meltdown');
        expect(grooveBand(0, thresholds).label).toBe('MELTDOWN');
        expect(grooveBand(0, thresholds).colour).toBe(0x7a1e1e);
    });

    it('reads the boundaries from the level thresholds, not the defaults', () => {
        expect(grooveBand(60, { onFire: 60, groove: 40, churn: 20, meltdown: 5 }).band).toBe(
            'onFire',
        );
    });
});
