import { describe, expect, it } from 'vitest';

import {
    CUES,
    DEFAULT_AUDIO_SETTINGS,
    MAX_LATE_MS,
    MAX_SCHEDULE_AHEAD_MS,
    MIN_GAIN,
    SETTINGS_KEY,
    TIMING_CUES,
    type CueName,
    coerceAudioSettings,
    contextTimeFor,
    cueDurationMs,
    effectiveVolume,
    envelope,
    mergeAudioSettings,
    stepVolume,
} from '../audio/cues';

/**
 * The half of F18 that has an answer without a browser: the cue table's
 * invariants, the envelope schedule, the clock bridge and the settings
 * coercion. `Audio.test.ts` covers the engine that reads them.
 */

const CUE_NAMES = Object.keys(CUES) as CueName[];

describe('the cue table', () => {
    it('has a voice for every cue', () => {
        for (const name of CUE_NAMES) {
            expect(CUES[name].voices.length, name).toBeGreaterThan(0);
        }
    });

    it('says what every cue is for', () => {
        for (const name of CUE_NAMES) {
            expect(CUES[name].purpose.length, name).toBeGreaterThan(0);
        }
    });

    /**
     * The constraint, asserted rather than promised (F18 §Goal): audio is
     * never the only channel, so a cue with nothing to see instead of it is a
     * cue a muted or deaf player loses information to. A fifteenth cue added
     * without a visual counterpart fails here.
     */
    it('names the thing you can see instead of every cue', () => {
        for (const name of CUE_NAMES) {
            expect(CUES[name].seenAs.length, name).toBeGreaterThan(0);
        }
    });

    it('envelopes every voice, so nothing starts or stops a bare oscillator', () => {
        for (const name of CUE_NAMES) {
            for (const voice of CUES[name].voices) {
                expect(voice.attackMs, name).toBeGreaterThan(0);
                expect(voice.releaseMs, name).toBeGreaterThan(0);
            }
        }
    });

    it('attacks every timing cue in 8 ms or less', () => {
        for (const name of TIMING_CUES) {
            for (const voice of CUES[name].voices) {
                expect(voice.attackMs, name).toBeLessThanOrEqual(8);
            }
        }
    });

    it('keeps every cue inside one 150 bpm beat', () => {
        for (const name of CUE_NAMES) {
            expect(cueDurationMs(name), name).toBeLessThanOrEqual(400);
        }
    });

    it('keeps every peak inside 0 to 1', () => {
        for (const name of CUE_NAMES) {
            for (const voice of CUES[name].voices) {
                expect(voice.peak, name).toBeGreaterThan(0);
                expect(voice.peak, name).toBeLessThanOrEqual(1);
            }
        }
    });

    it('carries F07 and F16 pitches so those docs lose no sound design', () => {
        expect(CUES.thunk.voices[0]?.freq).toBe(90);
        expect(CUES.thunk.voices[0]?.toFreq).toBe(45);
        expect(CUES.clink.voices[0]?.freq).toBe(1200);
        expect(CUES.slop.voices[0]?.freq).toBe(200);
        expect(CUES.slop.voices[0]?.toFreq).toBe(80);
        expect(CUES.warn.voices[0]?.freq).toBe(660);
        expect(CUES.alarm.voices[0]?.freq).toBe(880);
    });

    /**
     * Two cues on the same fundamental are one cue to an ear in a room with two
     * other people shouting. `beep` and `perfect` both sat on 880 Hz triangle,
     * which made "shove now" and "you shoved well" indistinguishable for their
     * first 70 ms at the one station that fires both all day.
     */
    it('gives every cue its own fundamental', () => {
        const byPitch = new Map<number, CueName>();

        for (const name of CUE_NAMES) {
            const freq = CUES[name].voices[0]?.freq ?? 0;
            const taken = byPitch.get(freq);

            expect(taken, `${name} shares ${freq} Hz with ${taken ?? ''}`).toBeUndefined();
            byPitch.set(freq, name);
        }
    });

    /**
     * Ranked by urgency, not by physical loudness. The six-second countdown to
     * an explosion and the judged timing edges have to outrank somebody else's
     * routine keg, which at `thunk: 0.6` they did not.
     */
    it('ranks the hazard and timing cues above another player routine success', () => {
        const peak = (name: CueName): number =>
            Math.max(...CUES[name].voices.map((voice) => voice.peak));

        for (const urgent of ['hiss', 'bandEdge', 'gold', 'tickAccent'] as CueName[]) {
            expect(peak(urgent), urgent).toBeGreaterThan(peak('thunk'));
        }

        expect(peak('hiss')).toBeGreaterThan(peak('alarm'));
        // The blast is the loss condition; nothing else may be louder than it.
        for (const name of CUE_NAMES) expect(peak(name), name).toBeLessThanOrEqual(peak('boom'));
    });
});

describe('cueDurationMs', () => {
    it('is the latest voice end, not the first', () => {
        const [first, second] = CUES.perfect.voices;

        expect(second?.atMs).toBeGreaterThan(0);
        expect(cueDurationMs('perfect')).toBe(
            (second?.atMs ?? 0) +
                (second?.attackMs ?? 0) +
                (second?.holdMs ?? 0) +
                (second?.releaseMs ?? 0),
        );
        expect(cueDurationMs('perfect')).toBeGreaterThan(
            (first?.attackMs ?? 0) + (first?.holdMs ?? 0) + (first?.releaseMs ?? 0),
        );
    });

    it('is the single voice for a one-voice cue', () => {
        const voice = CUES.tick.voices[0];

        expect(cueDurationMs('tick')).toBe(
            (voice?.atMs ?? 0) +
                (voice?.attackMs ?? 0) +
                (voice?.holdMs ?? 0) +
                (voice?.releaseMs ?? 0),
        );
    });
});

describe('envelope', () => {
    const voice = {
        wave: 'sine' as const,
        freq: 440,
        atMs: 0,
        attackMs: 4,
        holdMs: 20,
        releaseMs: 36,
        peak: 0.5,
    };

    it('rises from the floor to the peak over the attack', () => {
        const points = envelope(voice, 0, 1);

        expect(points[0]).toEqual({ at: 0, value: MIN_GAIN, ramp: 'set' });
        expect(points[1]).toEqual({ at: 0.004, value: 0.5, ramp: 'linear' });
    });

    it('holds the peak for the hold and then decays exponentially', () => {
        const points = envelope(voice, 0, 1);

        expect(points[2]).toEqual({ at: 0.024, value: 0.5, ramp: 'set' });
        expect(points[3]).toEqual({ at: 0.06, value: MIN_GAIN, ramp: 'exp' });
    });

    it('sets exactly zero at the end, because an exponential ramp cannot reach it', () => {
        const points = envelope(voice, 0, 1);
        const last = points[points.length - 1];

        expect(last).toEqual({ at: 0.06, value: 0, ramp: 'set' });
        expect(points.filter((p) => p.ramp === 'exp' && p.value === 0)).toHaveLength(0);
    });

    it('starts from the start time it is handed', () => {
        const points = envelope(voice, 10, 1);

        expect(points[0]?.at).toBe(10);
        expect(points[1]?.at).toBeCloseTo(10.004, 10);
    });

    it('scales the peak by the level and never by the time', () => {
        const points = envelope(voice, 0, 0.25);

        expect(points[1]?.value).toBe(0.125);
        expect(points[1]?.at).toBe(0.004);
    });

    it('floors a level that would put the peak under the gain floor', () => {
        const points = envelope(voice, 0, 0);

        expect(points[1]?.value).toBe(MIN_GAIN);
        expect(points[2]?.value).toBe(MIN_GAIN);
    });

    it('offsets by the voice atMs, so a two-tone cue is two voices on one clock', () => {
        const second = { ...voice, atMs: 80 };

        expect(envelope(second, 0, 1)[0]?.at).toBe(0.08);
    });
});

describe('contextTimeFor', () => {
    it('adds the delta in seconds', () => {
        expect(contextTimeFor(400, 12)).toBeCloseTo(12.4, 10);
    });

    it('accepts a zero delta as now', () => {
        expect(contextTimeFor(0, 12)).toBe(12);
    });

    it('clamps a delta a frame in the past to now, because one frame late still reads on the beat', () => {
        expect(contextTimeFor(-10, 12)).toBe(12);
        expect(contextTimeFor(-MAX_LATE_MS, 12)).toBe(12);
    });

    it('drops a stale cue rather than letting WebAudio fire it immediately', () => {
        expect(contextTimeFor(-MAX_LATE_MS - 1, 12)).toBeNull();
        expect(contextTimeFor(-5000, 12)).toBeNull();
    });

    it('drops a cue booked past the horizon, where the clock estimate is not the estimate any more', () => {
        expect(contextTimeFor(MAX_SCHEDULE_AHEAD_MS, 12)).not.toBeNull();
        expect(contextTimeFor(MAX_SCHEDULE_AHEAD_MS + 1, 12)).toBeNull();
    });

    it('refuses a delta that is not a finite number', () => {
        expect(contextTimeFor(Number.NaN, 12)).toBeNull();
        expect(contextTimeFor(Number.POSITIVE_INFINITY, 12)).toBeNull();
    });
});

describe('coerceAudioSettings', () => {
    it('round-trips a good payload', () => {
        expect(coerceAudioSettings({ volume: 0.4, muted: true })).toEqual({
            volume: 0.4,
            muted: true,
        });
    });

    it('defaults a payload that is not an object', () => {
        expect(coerceAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS);
        expect(coerceAudioSettings('loud')).toEqual(DEFAULT_AUDIO_SETTINGS);
        expect(coerceAudioSettings([1, 2])).toEqual(DEFAULT_AUDIO_SETTINGS);
        expect(coerceAudioSettings(undefined)).toEqual(DEFAULT_AUDIO_SETTINGS);
    });

    it('clamps a volume outside 0 to 1', () => {
        expect(coerceAudioSettings({ volume: 4 }).volume).toBe(1);
        expect(coerceAudioSettings({ volume: -2 }).volume).toBe(0);
    });

    it('defaults a volume that is not a finite number', () => {
        expect(coerceAudioSettings({ volume: 'loud' }).volume).toBe(DEFAULT_AUDIO_SETTINGS.volume);
        expect(coerceAudioSettings({ volume: Number.NaN }).volume).toBe(
            DEFAULT_AUDIO_SETTINGS.volume,
        );
    });

    it('defaults a muted that is not a boolean', () => {
        expect(coerceAudioSettings({ muted: 'yes' }).muted).toBe(false);
        expect(coerceAudioSettings({ muted: 1 }).muted).toBe(false);
    });

    it('keeps the other field when only one is present', () => {
        expect(coerceAudioSettings({ muted: true })).toEqual({
            volume: DEFAULT_AUDIO_SETTINGS.volume,
            muted: true,
        });
    });
});

describe('mergeAudioSettings', () => {
    it("keeps F13's other three fields in the shared key", () => {
        const merged = mergeAudioSettings(
            { volume: 0.2, muted: false, reducedMotion: true, colourSafe: true, uiScale: 1.25 },
            { volume: 0.9, muted: true },
        );

        expect(merged).toEqual({
            volume: 0.9,
            muted: true,
            reducedMotion: true,
            colourSafe: true,
            uiScale: 1.25,
        });
    });

    it('starts from an empty object when the stored value is not one', () => {
        expect(mergeAudioSettings('junk', { volume: 0.5, muted: false })).toEqual({
            volume: 0.5,
            muted: false,
        });
    });

    it('writes the key F13 owns', () => {
        expect(SETTINGS_KEY).toBe('dynamite.settings');
    });
});

describe('effectiveVolume', () => {
    it('is zero when muted, whatever the volume', () => {
        expect(effectiveVolume({ volume: 1, muted: true })).toBe(0);
    });

    it('is the volume when not muted', () => {
        expect(effectiveVolume({ volume: 0.35, muted: false })).toBe(0.35);
    });

    it('clamps', () => {
        expect(effectiveVolume({ volume: 9, muted: false })).toBe(1);
        expect(effectiveVolume({ volume: -1, muted: false })).toBe(0);
    });

    it('defaults to on at a modest level', () => {
        expect(DEFAULT_AUDIO_SETTINGS).toEqual({ volume: 0.7, muted: false });
    });
});

describe('stepVolume', () => {
    it('moves on a 0.05 grid', () => {
        expect(stepVolume(0.7, 1)).toBe(0.75);
        expect(stepVolume(0.7, -1)).toBe(0.65);
    });

    it('clamps at both ends', () => {
        expect(stepVolume(1, 1)).toBe(1);
        expect(stepVolume(0, -1)).toBe(0);
    });

    it('does not accumulate float error over twenty steps', () => {
        let v = 0;

        for (let i = 0; i < 20; i++) v = stepVolume(v, 1);

        expect(v).toBe(1);
    });

    it('snaps a value off the grid onto it', () => {
        expect(stepVolume(0.71, -1)).toBe(0.65);
    });
});
