import type { StationType } from '@shared';

import { dockOverlay, dockStationView } from './Dock';
import { Stub } from './Stub';
import type { OverlayFactory, StationView } from './types';

/**
 * Station type to overlay (contracts §10.9). F07, F08 and F09 each replace their
 * own entry with the real overlay and add a `stationViews` entry; until then a
 * stub keeps the panel — and the floor messages behind it — working.
 */

export const minigames: Record<StationType, OverlayFactory> = {
    boom_powder: () =>
        new Stub(
            true,
            'BOOM POWDER — THE SLAMMER',
            '← ↑ → mash (each once) · hold SPACE charge · release · E floor the keg · ESC bail',
        ),
    assembly: () =>
        new Stub(
            true,
            'ASSEMBLY — THE JIG',
            'A: ← → seat / knots · SPACE pour / crimp · ESC bail   B: ← → short/long · E spool, E cap · hold SPACE toss',
        ),
    dock: dockOverlay,
};

export const stationViews: Partial<Record<StationType, () => StationView>> = {
    dock: dockStationView,
};

export * from './types';
