import type { FxKind, FxMsg } from '@shared';
import { describe, expect, it, vi } from 'vitest';

import { FX_SPECS, Fx } from '../fx/Fx';
import type { Factory } from '../scenes/Factory';

/** Contracts §4 lists exactly these; a missing one is an effect the server can fire into nothing. */
const KINDS: FxKind[] = [
    'thunk',
    'spark',
    'fuse',
    'blast',
    'fizzle',
    'snap',
    'whump',
    'horn',
    'slam',
    'chime',
    'clink',
    'pfft',
    'bonk',
    'slop',
];

function scene(): Factory {
    return new Proxy(
        {},
        {
            get(_target, prop): never {
                throw new Error(`the default renderer touched scene.${String(prop)}`);
            },
        },
    ) as Factory;
}

function fx(): Fx {
    return new Fx(scene(), {} as Phaser.GameObjects.Container);
}

describe('FX_SPECS', () => {
    it('has an entry for every FxKind in the shared union', () => {
        expect(Object.keys(FX_SPECS).sort()).toEqual([...KINDS].sort());
    });
});

describe('Fx.override', () => {
    it('uses an overridden handler instead of the default for that kind', () => {
        const handler = vi.fn();
        const effects = fx();
        const message: FxMsg = { kind: 'thunk', x: 3, y: 4 };

        effects.override('thunk', handler);
        effects.play(message);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0]?.[1]).toEqual(message);
    });

    it('leaves the other kinds on their default renderer', () => {
        const effects = fx();

        effects.override('thunk', vi.fn());

        expect(() => effects.play({ kind: 'spark', x: 0, y: 0 })).toThrow(
            'the default renderer touched scene.',
        );
    });
});
