/**
 * F18's pure half: the cue table, the envelope schedule, the clock bridge and
 * the settings shape. Nothing here touches an `AudioContext`, a clock or the
 * DOM, so every decision the engine makes has an answer a test can assert.
 */

export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

/**
 * One enveloped oscillator burst. A cue is one to three of these, which is why
 * there is no voice class: a click, a blip, a two-tone confirm and a buzz are
 * one primitive wearing four sets of numbers.
 */
export interface Voice {
    wave: Wave;
    freq: number;
    /** Glide target, reached at the end of the hold. Absent = a steady pitch. */
    toFreq?: number;
    /** Offset from the cue's own start, so a two-tone confirm is two voices. */
    atMs: number;
    attackMs: number;
    holdMs: number;
    releaseMs: number;
    /** 0–1, before the player's volume and before the caller's own gain. */
    peak: number;
}

export interface CueSpec {
    readonly voices: readonly Voice[];
    /** What this sound means. */
    readonly purpose: string;
    /**
     * The thing already on screen that carries the same fact. Never empty:
     * audio is a second channel, never the only one, and `cues.test.ts`
     * asserts that rather than trusting it.
     */
    readonly seenAs: string;
}

export type CueName =
    | 'tick'
    | 'tickAccent'
    | 'beep'
    | 'bandEdge'
    | 'gold'
    | 'leaving'
    | 'perfect'
    | 'ok'
    | 'miss'
    | 'thunk'
    | 'thunkBig'
    | 'clink'
    | 'dud'
    | 'pfft'
    | 'slop'
    | 'grab'
    | 'catch'
    | 'shout'
    | 'hiss'
    | 'warn'
    | 'alarm'
    | 'boom'
    | 'save'
    | 'horn'
    | 'chime'
    | 'bonk';

/**
 * Two rules the table is read against, both with a test behind them.
 *
 * **One fundamental each.** `beep` and `perfect` both sat on 880 Hz triangle,
 * so at the dock the confirmation that you nailed the beep *began as another
 * beep* and was indistinguishable from one for 70 ms. No two cues share a
 * first-voice pitch any more.
 *
 * **Peaks are ranked by urgency, not by physical loudness.** The six-second
 * countdown to an explosion (`hiss`) and the judged timing edges sit above
 * somebody else's routine keg (`thunk`), which at 0.6 was the loudest thing in
 * the game. Only the blast is allowed above them.
 */
export const CUES: Readonly<Record<CueName, CueSpec>> = {
    tick: {
        voices: [
            { wave: 'square', freq: 1100, atMs: 0, attackMs: 1, holdMs: 8, releaseMs: 16, peak: 0.3 },
        ],
        purpose:
            'A beat on the grid, never the beat you act on: the pour beats, every knot, ratchet clicks one and two, chutes one and two.',
        seenAs: 'the beat marks, knot markers and click lines the panels already draw, and the sweeping needle',
    },
    tickAccent: {
        voices: [
            { wave: 'square', freq: 1650, atMs: 0, attackMs: 1, holdMs: 12, releaseMs: 22, peak: 0.42 },
        ],
        purpose:
            'The beat you act on: the crimp’s third click, the pour mark, and the third chute that arms the plunger.',
        seenAs: 'the numbered third click line at 3 px, lit as the needle reaches it, the pour’s mark line, and the plunger bar going green',
    },
    beep: {
        voices: [
            { wave: 'triangle', freq: 700, atMs: 0, attackMs: 4, holdMs: 60, releaseMs: 46, peak: 0.3 },
        ],
        purpose:
            "The dock's reversing beep, once a second while a truck is docked. Shove on it. It sits below every confirmation on purpose.",
        seenAs: 'the cyan marker crossing the centre line of the beep row, and the bay light strobe',
    },
    bandEdge: {
        voices: [
            { wave: 'square', freq: 620, atMs: 0, attackMs: 1, holdMs: 5, releaseMs: 14, peak: 0.3 },
        ],
        purpose: 'The Slammer needle crossing into the OK band. There is no closing tick: see `slammerPulses`.',
        seenAs: 'the amber band drawn on the gauge, with the needle entering it',
    },
    gold: {
        voices: [
            { wave: 'square', freq: 1480, atMs: 0, attackMs: 1, holdMs: 9, releaseMs: 20, peak: 0.38 },
        ],
        purpose: 'The Slammer needle crossing the gold hairline — the release the legend points at.',
        seenAs: 'the gold hairline, its translucent strip, and the two gold sights bracketing it above and below the track',
    },
    leaving: {
        voices: [
            { wave: 'square', freq: 466, atMs: 0, attackMs: 2, holdMs: 40, releaseMs: 50, peak: 0.3 },
            { wave: 'square', freq: 349, atMs: 110, attackMs: 2, holdMs: 40, releaseMs: 60, peak: 0.3 },
        ],
        purpose:
            'Each of a docked truck’s last five seconds. It falls where `beep` rises, so "the truck is going" is audibly the opposite of "shove now".',
        seenAs: 'the bay-wall countdown flashing amber through its last five seconds',
    },
    perfect: {
        voices: [
            { wave: 'triangle', freq: 990, atMs: 0, attackMs: 3, holdMs: 30, releaseMs: 37, peak: 0.26 },
            { wave: 'triangle', freq: 1320, atMs: 70, attackMs: 3, holdMs: 30, releaseMs: 37, peak: 0.26 },
        ],
        purpose: 'A Perfect judgement anywhere the server grades a press, the gold release included.',
        seenAs: 'the jig’s gold PERFECT pop, the Slammer’s gold verdict badge, the dock’s THUD and its P slot lamp',
    },
    ok: {
        voices: [
            { wave: 'triangle', freq: 740, atMs: 0, attackMs: 4, holdMs: 40, releaseMs: 36, peak: 0.22 },
        ],
        purpose: 'An OK judgement — it counted, it was not clean.',
        seenAs: 'the jig’s green OK pop, the Slammer’s green band verdict, the dock’s scrape and its O slot lamp',
    },
    miss: {
        voices: [
            { wave: 'sawtooth', freq: 160, atMs: 0, attackMs: 5, holdMs: 60, releaseMs: 115, peak: 0.28 },
        ],
        purpose: 'A miss, a stall, or a press the station refused.',
        seenAs: 'the red MISS pop with its EARLY/LATE readout, and the dock lane chip turning red on STALLED',
    },
    thunk: {
        voices: [
            {
                wave: 'sine',
                freq: 90,
                toFreq: 45,
                atMs: 0,
                attackMs: 4,
                holdMs: 40,
                releaseMs: 76,
                peak: 0.22,
            },
        ],
        purpose:
            "An ordinary keg landing in the hopper, and the tailgate slamming (F07's thunk).",
        seenAs: 'the hopper squash, the camera shake, the confetti and the combo counter ticking',
    },
    thunkBig: {
        voices: [
            {
                wave: 'sine',
                freq: 70,
                toFreq: 32,
                atMs: 0,
                attackMs: 4,
                holdMs: 60,
                releaseMs: 110,
                peak: 0.3,
            },
        ],
        purpose:
            'A prime keg landing. Deeper than `thunk` rather than louder: a gain difference is the first distinction a noisy room destroys.',
        seenAs: 'the bigger shake, the doubled confetti, the brass flag and the gold verdict badge',
    },
    clink: {
        voices: [
            { wave: 'sine', freq: 1200, atMs: 0, attackMs: 2, holdMs: 20, releaseMs: 38, peak: 0.18 },
        ],
        purpose:
            "An item leaving your hands onto a shelf or the floor. Nothing else: an early keg has its own cue, because “you put something down” and “you ruined that one” need different corrections.",
        seenAs: 'the item dropping out of the carry position, and FX_SPECS.clink — three particles and the word clink',
    },
    dud: {
        voices: [
            {
                wave: 'sine',
                freq: 420,
                toFreq: 180,
                atMs: 0,
                attackMs: 3,
                holdMs: 40,
                releaseMs: 70,
                peak: 0.2,
            },
        ],
        purpose: 'An early release — the plunger let go before the band. It falls, next to `pfft` for late.',
        seenAs: 'the Slammer’s EARLY verdict with its millisecond readout, and FX_SPECS.clink at the hopper',
    },
    pfft: {
        voices: [
            { wave: 'sawtooth', freq: 220, atMs: 0, attackMs: 6, holdMs: 40, releaseMs: 104, peak: 0.16 },
        ],
        purpose: "A damp keg, a late release, a fizzle (F07's pfft). Band-passed noise in F07; a short buzz here, which costs no second primitive.",
        seenAs: 'FX_SPECS.pfft — the drifting grey puff and the word pfft',
    },
    slop: {
        voices: [
            {
                wave: 'sine',
                freq: 200,
                toFreq: 80,
                atMs: 0,
                attackMs: 6,
                holdMs: 70,
                releaseMs: 124,
                peak: 0.3,
            },
        ],
        purpose: "An overflow spill (F07's slop) — a fourth or repeated chute press.",
        seenAs: 'the already-lit chute square flashing red under the refused key, FX_SPECS.slop and the brown splash over the hopper rim',
    },
    grab: {
        voices: [
            { wave: 'triangle', freq: 320, atMs: 0, attackMs: 2, holdMs: 14, releaseMs: 29, peak: 0.16 },
        ],
        purpose: 'A pair of hands closing on something off a shelf, a tray or the floor.',
        seenAs: 'the item lifting to ride 20 px above the avatar that picked it up',
    },
    catch: {
        voices: [
            {
                wave: 'triangle',
                freq: 500,
                toFreq: 1000,
                atMs: 0,
                attackMs: 2,
                holdMs: 40,
                releaseMs: 48,
                peak: 0.22,
            },
        ],
        purpose: 'A thrown item arriving in your own hands — the rise is the "got it".',
        seenAs: "the arc ending on your avatar, plus the server's PERFECT or clink at the landing",
    },
    shout: {
        voices: [
            { wave: 'triangle', freq: 587, atMs: 0, attackMs: 3, holdMs: 50, releaseMs: 50, peak: 0.3 },
            { wave: 'triangle', freq: 1175, atMs: 90, attackMs: 3, holdMs: 50, releaseMs: 60, peak: 0.26 },
        ],
        purpose:
            'A crew-mate shouting. A rising octave, so it reads as somebody calling rather than as a machine. The word itself is carried on screen.',
        seenAs: 'the speech bubble over the avatar that shouted, and the same word in the HUD toast strip, which reaches a player inside an overlay',
    },
    hiss: {
        voices: [
            {
                wave: 'sawtooth',
                freq: 2400,
                toFreq: 1800,
                atMs: 0,
                attackMs: 2,
                holdMs: 18,
                releaseMs: 40,
                peak: 0.32,
            },
        ],
        purpose:
            'One pulse of a lit fuse, twice as often inside the last two seconds. It outranks the beacon: a six-second countdown beats a standing condition.',
        seenAs: 'the sparkle on the keg, its shortening cord, and the amber turning orange',
    },
    warn: {
        voices: [
            { wave: 'triangle', freq: 660, atMs: 0, attackMs: 4, holdMs: 45, releaseMs: 41, peak: 0.26 },
        ],
        purpose:
            "A warning crossing: a station's beacon going gold, and (F16) a fumble meter entering wobble.",
        seenAs: 'the gold lamp on the beacon pole, and F16’s amber shaking fumble gauge',
    },
    alarm: {
        voices: [
            { wave: 'square', freq: 880, atMs: 0, attackMs: 1, holdMs: 8, releaseMs: 21, peak: 0.24 },
        ],
        purpose:
            'One pulse of an emergency: the crossing into red DANGER, three pulses and then quiet; and (F16) the 4 Hz critical tick.',
        seenAs: 'the pulsing red lamp and the hazard stripes round the pile, both of which outlast the sound; F16’s flashing RED LINE gauge',
    },
    boom: {
        voices: [
            {
                wave: 'sine',
                freq: 150,
                toFreq: 38,
                atMs: 0,
                attackMs: 4,
                holdMs: 90,
                releaseMs: 260,
                peak: 0.5,
            },
            { wave: 'sawtooth', freq: 55, atMs: 0, attackMs: 6, holdMs: 120, releaseMs: 200, peak: 0.3 },
        ],
        purpose:
            'The blast. The loss condition on levels 2–4, and the one cue allowed to be the loudest thing in the game.',
        seenAs: 'BlastFx’s white flash and expanding ring, the camera shake, and the soot on everyone it caught',
    },
    save: {
        voices: [
            { wave: 'triangle', freq: 520, atMs: 0, attackMs: 4, holdMs: 60, releaseMs: 80, peak: 0.28 },
            { wave: 'triangle', freq: 780, atMs: 0, attackMs: 4, holdMs: 60, releaseMs: 80, peak: 0.2 },
        ],
        purpose: 'A keg smothered in the sand bin — the one hazard effect that is a reward. A chord, not a sequence.',
        seenAs: 'FX_SPECS.whump — the sand ring over the bin — and the fuse sparkle going out',
    },
    horn: {
        voices: [
            { wave: 'triangle', freq: 392, atMs: 0, attackMs: 6, holdMs: 110, releaseMs: 60, peak: 0.26 },
            { wave: 'triangle', freq: 330, atMs: 130, attackMs: 6, holdMs: 110, releaseMs: 70, peak: 0.26 },
        ],
        purpose: 'The truck pulling out. A descending two-tone, which is what FX_SPECS.horn has been drawing the word for.',
        seenAs: 'FX_SPECS.horn — the word HONK over the bay — and the truck sliding out of the door',
    },
    chime: {
        voices: [
            { wave: 'sine', freq: 1568, atMs: 0, attackMs: 3, holdMs: 50, releaseMs: 120, peak: 0.24 },
            { wave: 'sine', freq: 2093, atMs: 60, attackMs: 3, holdMs: 50, releaseMs: 140, peak: 0.16 },
        ],
        purpose: 'An order filled, or a station coming back from damage — the floor’s good news.',
        seenAs: 'FX_SPECS.chime — the brass flash over the station — and the order leaving the Tab board',
    },
    bonk: {
        voices: [
            { wave: 'square', freq: 260, atMs: 0, attackMs: 2, holdMs: 30, releaseMs: 50, peak: 0.18 },
        ],
        purpose: 'The floor refusing an action: a full shelf, the wrong fuse, a busy machine.',
        seenAs: 'FX_SPECS.bonk — the word bonk, or FULL, WRONG FUSE or BUSY, where the press was refused',
    },
};

/**
 * The cues whose whole information is their onset. A 20 ms attack on one of
 * these is a beat that arrives 20 ms late for a game judged at ±45 ms, so the
 * table's attack budget is asserted separately for them.
 */
export const TIMING_CUES: readonly CueName[] = [
    'tick',
    'tickAccent',
    'beep',
    'bandEdge',
    'gold',
    'alarm',
];

export function voiceDurationMs(voice: Voice): number {
    return voice.atMs + voice.attackMs + voice.holdMs + voice.releaseMs;
}

export function cueDurationMs(cue: CueName): number {
    let end = 0;

    for (const voice of CUES[cue].voices) end = Math.max(end, voiceDurationMs(voice));

    return end;
}

/**
 * `exponentialRampToValueAtTime(0, …)` throws in every engine — an exponential
 * curve cannot reach zero — so the decay lands here and a plain set silences
 * it afterwards.
 */
export const MIN_GAIN = 0.0001;

export interface EnvelopePoint {
    at: number;
    value: number;
    ramp: 'set' | 'linear' | 'exp';
}

/**
 * The gain schedule for one voice, as data. A raw `start`/`stop` on a gain of
 * 1 clicks audibly at both ends and reads as broken rather than as short, so
 * no voice is ever played without this.
 */
export function envelope(voice: Voice, startSec: number, level: number): EnvelopePoint[] {
    const at = (offsetMs: number): number => startSec + (voice.atMs + offsetMs) / 1000;
    const peak = Math.max(MIN_GAIN, voice.peak * level);
    const held = voice.attackMs + voice.holdMs;
    const end = at(held + voice.releaseMs);

    return [
        { at: at(0), value: MIN_GAIN, ramp: 'set' },
        { at: at(voice.attackMs), value: peak, ramp: 'linear' },
        { at: at(held), value: peak, ramp: 'set' },
        { at: end, value: MIN_GAIN, ramp: 'exp' },
        { at: end, value: 0, ramp: 'set' },
    ];
}

/**
 * A beat one frame late still reads as on the beat; a beat half a second late
 * reads as a bug. WebAudio fires a `start` time in the past immediately rather
 * than failing, so the lateness has to be refused here.
 */
export const MAX_LATE_MS = 25;

/**
 * `ServerClock` extrapolates up to `CLOCK_EXTRAPOLATE_MAX_S` between patches,
 * so a cue booked further out than this is booked against an estimate that
 * will have been re-based several times before it sounds.
 */
export const MAX_SCHEDULE_AHEAD_MS = 1500;

/** `null` = do not play it. Never "play it now instead". */
export function contextTimeFor(deltaMs: number, ctxNow: number): number | null {
    if (!Number.isFinite(deltaMs)) return null;
    if (deltaMs > MAX_SCHEDULE_AHEAD_MS) return null;
    if (deltaMs < -MAX_LATE_MS) return null;

    return deltaMs <= 0 ? ctxNow : ctxNow + deltaMs / 1000;
}

/** The two fields F18 owns inside F13's settings object. */
export interface AudioSettings {
    volume: number;
    muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { volume: 0.7, muted: false };

/** F13's key. F18 reads and writes two of its fields and preserves the rest. */
export const SETTINGS_KEY = 'dynamite.settings';

/** `[` and `]` move the volume a twentieth at a time. */
const VOLUME_STEPS = 20;

function clamp01(v: number): number {
    return Math.min(1, Math.max(0, v));
}

function fields(raw: unknown): Record<string, unknown> {
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
}

export function coerceAudioSettings(raw: unknown): AudioSettings {
    const from = fields(raw);
    const volume = from.volume;
    const muted = from.muted;

    return {
        volume:
            typeof volume === 'number' && Number.isFinite(volume)
                ? clamp01(volume)
                : DEFAULT_AUDIO_SETTINGS.volume,
        muted: typeof muted === 'boolean' ? muted : DEFAULT_AUDIO_SETTINGS.muted,
    };
}

/**
 * F13 writes `reducedMotion`, `colourSafe` and `uiScale` to the same key, so a
 * whole-object write from here would be the last writer taking all of it.
 */
export function mergeAudioSettings(raw: unknown, next: AudioSettings): Record<string, unknown> {
    return { ...fields(raw), volume: next.volume, muted: next.muted };
}

export function effectiveVolume(settings: AudioSettings): number {
    return settings.muted ? 0 : clamp01(settings.volume);
}

/** Stepped on the grid rather than added to, so twenty presses land on exactly 1. */
export function stepVolume(volume: number, delta: number): number {
    const steps = Math.round(clamp01(volume) * VOLUME_STEPS + delta);

    return Math.min(VOLUME_STEPS, Math.max(0, steps)) / VOLUME_STEPS;
}
