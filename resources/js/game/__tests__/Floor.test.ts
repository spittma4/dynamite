import { describe, expect, it } from 'vitest';

import { beaconColour } from '../render/Floor';
import { UI } from '../render/palette';

/**
 * The pole is the one place the beacon colour is drawn (F04 §3), so the colour
 * is a function of `StationState.beacon` and the server clock alone.
 */

describe('beaconColour', () => {
    it('is dark while the station is calling for nothing', () => {
        expect(beaconColour('off', 0)).toBe(UI.beaconOff);
        expect(beaconColour('', 12.5)).toBe(UI.beaconOff);
    });

    it('is gold whenever a pickup is wanted, whatever the clock says', () => {
        expect(beaconColour('gold', 0)).toBe(UI.beaconGold);
        expect(beaconColour('gold', 3.37)).toBe(UI.beaconGold);
    });

    it('blinks red twice a second', () => {
        expect(beaconColour('red', 0)).toBe(UI.beaconRed);
        expect(beaconColour('red', 0.2)).toBe(UI.beaconRed);
        expect(beaconColour('red', 0.3)).toBe(UI.beaconOff);
        expect(beaconColour('red', 0.45)).toBe(UI.beaconOff);
        expect(beaconColour('red', 0.5)).toBe(UI.beaconRed);
        expect(beaconColour('red', 12.8)).toBe(UI.beaconOff);
    });
});
