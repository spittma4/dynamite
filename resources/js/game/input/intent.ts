import type { Axis, EmoteKind } from '@shared';

/**
 * Pressed keys to movement intent (contracts §4). Shift turns the arrows into
 * emotes, so they must drop out of the intent for as long as it is held —
 * otherwise an emote walks you into the pile you were pointing at.
 */

export type ArrowKey = 'left' | 'right' | 'up' | 'down';

export interface MoveIntent {
    dx: Axis;
    dy: Axis;
}

export interface PressedKeys {
    w: boolean;
    a: boolean;
    s: boolean;
    d: boolean;
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    shift: boolean;
}

const EMOTES: Record<ArrowKey, EmoteKind> = {
    left: 'stop',
    up: 'help',
    right: 'go',
    down: 'what',
};

function axis(positive: boolean, negative: boolean): Axis {
    return ((positive ? 1 : 0) - (negative ? 1 : 0)) as Axis;
}

export function intentFrom(keys: PressedKeys): MoveIntent {
    const arrows = !keys.shift;

    return {
        dx: axis(keys.d || (arrows && keys.right), keys.a || (arrows && keys.left)),
        dy: axis(keys.s || (arrows && keys.down), keys.w || (arrows && keys.up)),
    };
}

export function emoteForArrow(arrow: ArrowKey): EmoteKind {
    return EMOTES[arrow];
}
