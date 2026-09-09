import type { StationType } from '../../shared';
import { dockModule } from './dock';
import { jigModule } from './jig';
import { slammerModule } from './slammer';
import type { MinigameModule } from './types';

/** One module per station type (contracts §10.3); `build` instantiates them. */
export const MINIGAMES: Record<StationType, MinigameModule> = {
    boom_powder: slammerModule,
    assembly: jigModule,
    dock: dockModule,
};

export * from './types';
