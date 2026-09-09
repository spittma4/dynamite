import { describe, expect, it } from 'vitest';

import * as shared from '../src/index';

describe('the barrel', () => {
    it('exposes the state classes, the messages and the pure sim', () => {
        for (const name of [
            'FactoryState',
            'PlayerState',
            'StationState',
            'ItemState',
            'FuseState',
            'OrderState',
            'TruckState',
            'ClientMsg',
            'ServerMsg',
            'isInputMsg',
            'LEVEL_DEFAULTS',
            'applyDefaults',
            'TICK_HZ',
            'packTile',
            'efficiencyFor',
            'cycleSeconds',
            'grooveDelta',
            'scaleLevel',
            'gradeDay',
            'bottleneckStation',
            'copy',
            'fill',
        ]) {
            expect(shared).toHaveProperty(name);
        }
    });

    it('keeps the validators — and ajv with them — out of the client bundle', () => {
        expect(shared).not.toHaveProperty('validateLevelConfig');
        expect(shared).not.toHaveProperty('validateLayoutConfig');
        expect(shared).not.toHaveProperty('validateLevelOnLayout');
    });
});
