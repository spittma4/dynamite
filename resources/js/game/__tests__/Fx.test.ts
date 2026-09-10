import type { FxKind, FxMsg } from '@shared';
import { describe, expect, it, vi } from 'vitest';

import type { GameAudio } from '../audio/Audio';
import { type AudioSettings, type CueName, DEFAULT_AUDIO_SETTINGS } from '../audio/cues';
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

/** A `GameAudio` that records the cue instead of making it. */
class RecordingAudio implements GameAudio {
    readonly available = true;
    readonly unlocked = true;
    readonly played: CueName[] = [];

    settings(): AudioSettings {
        return { ...DEFAULT_AUDIO_SETTINGS };
    }

    setVolume(): void {}

    setMuted(): void {}

    toggleMute(): boolean {
        return false;
    }

    nudgeVolume(): number {
        return DEFAULT_AUDIO_SETTINGS.volume;
    }

    unlock(): void {}

    play(cue: CueName): boolean {
        this.played.push(cue);

        return true;
    }

    afterMs(cue: CueName): boolean {
        return this.play(cue);
    }

    at(cue: CueName): boolean {
        return this.play(cue);
    }
}

function fx(audio?: GameAudio): Fx {
    return new Fx(scene(), {} as Phaser.GameObjects.Container, audio);
}

describe('FX_SPECS', () => {
    it('has an entry for every FxKind in the shared union', () => {
        expect(Object.keys(FX_SPECS).sort()).toEqual([...KINDS].sort());
    });
});

/**
 * The server's `fx` bus is the only channel that carries a floor-wide event to
 * every player, and it made no sound at all: the game had a noise for lifting a
 * keg off a shelf and none for the explosion that ends the day.
 *
 * F18 §Out rejected a generic `FxKind` → cue map for two reasons, and both are
 * answered here rather than ignored. A sound is a property of the *moment*, so
 * only the kinds whose moment has no other cue carry one — the four the
 * mini-games already sound at the press are left silent, or the player hears
 * the same keg twice. And `Fx.override` is global-per-kind with no fall-through,
 * so the cue is played in `play` *before* the dispatch: an override replaces
 * the drawing, never the sound, which is exactly the case `blast` is in.
 */
describe('the sound on the fx bus', () => {
    /** Sounded at the press by the overlay or the item layer, not here. */
    const AT_THE_CALL_SITE: FxKind[] = ['thunk', 'clink', 'pfft', 'slop', 'spark', 'fuse'];

    it('sounds the floor-wide kinds that had no cue anywhere', () => {
        for (const kind of KINDS.filter((k) => !AT_THE_CALL_SITE.includes(k))) {
            expect(FX_SPECS[kind].sound, kind).toBeDefined();
        }
    });

    it('stays silent for the kinds a mini-game already sounds at the press', () => {
        for (const kind of AT_THE_CALL_SITE) {
            expect(FX_SPECS[kind].sound, kind).toBeUndefined();
        }
    });

    it('gives the blast the loudest cue in the table, since it is the loss condition', () => {
        expect(FX_SPECS.blast.sound).toBe('boom');
    });

    it('plays the cue on an overridden kind, which is the one the blast uses', () => {
        const audio = new RecordingAudio();
        const effects = fx(audio);

        effects.override('blast', () => {});
        effects.play({ kind: 'blast', x: 3, y: 4 });

        expect(audio.played).toEqual(['boom']);
    });

    it('plays nothing for a kind the table leaves silent', () => {
        const audio = new RecordingAudio();
        const effects = fx(audio);

        effects.override('thunk', () => {});
        effects.play({ kind: 'thunk', x: 3, y: 4 });

        expect(audio.played).toEqual([]);
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
