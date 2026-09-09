import { bubblesSystem } from './bubbles';
import { itemsSystem } from './items';
import { dockSystem } from './minigames/dock';
import { movementSystem } from './movement';
import { stationsSystem } from './stations';
import type { System } from './World';

/**
 * The tick order from contracts §11. It is a list rather than a lookup because
 * the order is the design: hazards run after stations so a red beacon overrides
 * gold, and the report runs last so its `onDayEnd` sees the final state.
 *
 *   movement → bubbles → stations → items → hazards → dock → groove → report
 *
 * Each owner adds its own entry in that position as it lands: `movementSystem`
 * and `bubblesSystem` (F03) ahead of stations; `itemsSystem` (F06),
 * `hazardsSystem` (F10), `dockSystem` (F09), `grooveSystem` (F11) and
 * `reportSystem` (F11, always last) after it.
 */
export const SYSTEMS: System[] = [
    movementSystem,
    bubblesSystem,
    stationsSystem,
    itemsSystem,
    dockSystem,
];
