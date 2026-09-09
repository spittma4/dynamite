import type { StationType } from '@shared';
import { describe, expect, it } from 'vitest';

import { minigames, stationViews } from '../minigames';

const TYPES: StationType[] = ['boom_powder', 'assembly', 'dock'];

describe('the overlay registry', () => {
    it('has a factory for boom_powder, assembly and dock that returns a MinigameOverlay', () => {
        for (const type of TYPES) {
            const overlay = minigames[type]();

            expect(typeof overlay.mount).toBe('function');
            expect(typeof overlay.update).toBe('function');
            expect(typeof overlay.unmount).toBe('function');
            expect(overlay.onKey('left', true, false)).toBe(false);
        }
    });

    it('marks the dock overlay capturesMovement false and the other two true', () => {
        expect(minigames.boom_powder().capturesMovement).toBe(true);
        expect(minigames.assembly().capturesMovement).toBe(true);
        expect(minigames.dock().capturesMovement).toBe(false);
    });

    it('builds a fresh overlay per call so two stations never share one', () => {
        expect(minigames.dock()).not.toBe(minigames.dock());
    });

    it('carries a station view for every type, so no machine is unreadable from the floor', () => {
        for (const type of TYPES) {
            const view = stationViews[type]?.();

            expect(typeof view?.create).toBe('function');
            expect(typeof view?.update).toBe('function');
            expect(typeof view?.destroy).toBe('function');
        }
    });
});
