import type { StationType } from '@shared';

import { dockOverlay, dockStationView } from './Dock';
import { jigOverlay } from './Jig';
import { jigView } from './JigWorldFx';
import { slammerOverlay, slammerStationView } from './Slammer';
import type { OverlayFactory, StationView } from './types';

/**
 * Station type to overlay (contracts §10.9). F07, F08 and F09 each replace their
 * own entry with the real overlay and add a `stationViews` entry; until then a
 * stub keeps the panel — and the floor messages behind it — working.
 */

export const minigames: Record<StationType, OverlayFactory> = {
    boom_powder: slammerOverlay,
    assembly: jigOverlay,
    dock: dockOverlay,
};

export const stationViews: Partial<Record<StationType, () => StationView>> = {
    boom_powder: slammerStationView,
    assembly: jigView,
    dock: dockStationView,
};

export * from './types';
