import { beforeEach, describe, expect, it } from 'vitest';

import {
    CUES,
    DEFAULT_AUDIO_SETTINGS,
    MAX_LATE_MS,
    MAX_SCHEDULE_AHEAD_MS,
    MIN_GAIN,
    SETTINGS_KEY,
} from '../audio/cues';
import type { AudioOut, GainOut, NodeOut, OscOut, ParamOut, StorageLike } from '../audio/Audio';
import { createAudio, unlockOnGesture } from '../audio/Audio';

/**
 * The engine, against a recording context. The seam is a parameter rather than
 * a mock of the global, so the autoplay rule — the bug that fails silently in
 * a real browser and is invisible in review — has a test that fails loudly.
 */

interface ParamCall {
    method: 'set' | 'linear' | 'exp';
    value: number;
    at: number;
}

class FakeParam implements ParamOut {
    value = 0;
    readonly calls: ParamCall[] = [];

    setValueAtTime(value: number, at: number): void {
        this.calls.push({ method: 'set', value, at });
    }

    linearRampToValueAtTime(value: number, at: number): void {
        this.calls.push({ method: 'linear', value, at });
    }

    exponentialRampToValueAtTime(value: number, at: number): void {
        if (value === 0) throw new RangeError('exponentialRampToValueAtTime cannot reach 0');

        this.calls.push({ method: 'exp', value, at });
    }
}

class FakeGain implements GainOut {
    readonly gain = new FakeParam();
    readonly targets: NodeOut[] = [];
    connections = 0;
    disconnects = 0;

    connect(target: NodeOut): void {
        this.connections += 1;
        this.targets.push(target);
    }

    disconnect(): void {
        this.disconnects += 1;
    }
}

class FakeCompressor implements NodeOut {
    readonly targets: NodeOut[] = [];

    connect(target: NodeOut): void {
        this.targets.push(target);
    }

    disconnect(): void {}
}

class FakeOsc implements OscOut {
    type = 'sine';
    readonly frequency = new FakeParam();
    onended: unknown = null;
    startedAt: number | null = null;
    stoppedAt: number | null = null;
    disconnects = 0;

    connect(_target: NodeOut): void {}

    disconnect(): void {
        this.disconnects += 1;
    }

    start(at: number): void {
        this.startedAt = at;
    }

    stop(at: number): void {
        this.stoppedAt = at;
    }

    end(): void {
        if (typeof this.onended === 'function') (this.onended as () => void)();
    }
}

class FakeContext implements AudioOut {
    currentTime = 100;
    state = 'suspended';
    readonly destination: NodeOut = { connect: () => {}, disconnect: () => {} };
    readonly oscillators: FakeOsc[] = [];
    readonly gains: FakeGain[] = [];
    resumes = 0;

    resume(): Promise<void> {
        this.resumes += 1;
        this.state = 'running';

        return Promise.resolve();
    }

    createOscillator(): OscOut {
        const osc = new FakeOsc();

        this.oscillators.push(osc);

        return osc;
    }

    createGain(): GainOut {
        const gain = new FakeGain();

        this.gains.push(gain);

        return gain;
    }
}

/**
 * The real gap. `AudioContext.resume()` is asynchronous: on iOS Safari, and on
 * Chrome when the context was built outside the gesture, `state` stays
 * `'suspended'` until the promise settles one or more tasks later. A fake that
 * flips it synchronously hides every cue fired inside that window, which is
 * exactly the bug the ticket named.
 */
class SlowFakeContext extends FakeContext {
    override resume(): Promise<void> {
        this.resumes += 1;

        return Promise.resolve().then(() => {
            this.state = 'running';
        });
    }
}

class CompressingFakeContext extends FakeContext {
    readonly compressors: FakeCompressor[] = [];

    createDynamicsCompressor(): NodeOut {
        const node = new FakeCompressor();

        this.compressors.push(node);

        return node;
    }
}

class FakeStorage implements StorageLike {
    private readonly map = new Map<string, string>();

    constructor(
        private readonly throwOnGet = false,
        private readonly throwOnSet = false,
    ) {}

    getItem(key: string): string | null {
        if (this.throwOnGet) throw new Error('SecurityError: storage is blocked');

        return this.map.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        if (this.throwOnSet) throw new Error('QuotaExceededError');

        this.map.set(key, value);
    }

    seed(value: string): void {
        this.map.set(SETTINGS_KEY, value);
    }

    raw(): string | null {
        return this.map.get(SETTINGS_KEY) ?? null;
    }
}

/** The master gain is the first gain the engine makes; cue gains follow it. */
function cueGains(ctx: FakeContext): FakeGain[] {
    return ctx.gains.slice(1);
}

let ctx: FakeContext;
let storage: FakeStorage;
let made: number;

function audio(over: { storage?: StorageLike | null; context?: () => AudioOut | null } = {}) {
    return createAudio({
        context:
            over.context ??
            (() => {
                made += 1;

                return ctx;
            }),
        storage: over.storage === undefined ? storage : over.storage,
    });
}

beforeEach(() => {
    ctx = new FakeContext();
    storage = new FakeStorage();
    made = 0;
});

describe('the unlock', () => {
    it('creates no AudioContext until a gesture asks for one', () => {
        const a = audio();

        expect(made).toBe(0);
        expect(a.unlocked).toBe(false);
    });

    it('drops a cue asked for before the unlock without throwing', () => {
        const a = audio();

        expect(a.play('tick')).toBe(false);
        expect(made).toBe(0);
        expect(ctx.oscillators).toHaveLength(0);
    });

    /**
     * The burst. A suspended context drops every `start()` silently, so an
     * engine that queued them would fire five stale beeps at the moment the
     * player first touched a key — against a factory that has moved on.
     */
    it('queues nothing, so five cues asked for before the unlock stay unplayed', () => {
        const a = audio();

        for (let i = 0; i < 5; i++) a.play('beep');

        a.unlock();

        expect(ctx.oscillators).toHaveLength(0);
    });

    it('creates one context and resumes once however often the gesture fires', () => {
        const a = audio();

        a.unlock();
        a.unlock();
        a.unlock();

        expect(made).toBe(1);
        expect(ctx.resumes).toBe(1);
        expect(a.unlocked).toBe(true);
    });

    it('plays once unlocked', () => {
        const a = audio();

        a.unlock();

        expect(a.play('tick')).toBe(true);
        expect(ctx.oscillators).toHaveLength(1);
    });

    it('drops a cue while the context has gone back to suspended, and asks it to resume', () => {
        const a = audio();

        a.unlock();
        ctx.state = 'suspended';

        expect(a.play('tick')).toBe(false);
        expect(ctx.oscillators).toHaveLength(0);
        expect(ctx.resumes).toBe(2);
    });
});

/**
 * The drop-don't-queue contract across the *real* gap, stated rather than left
 * to a fake that resumes on the same tick. Dropping is the policy on purpose: a
 * burst of stale beeps replayed when the resume lands is worse than the handful
 * of cues lost between the gesture and the context actually running.
 */
describe('the unlock while the resume is still in flight', () => {
    it('drops a cue fired in the same tick as the gesture and creates no node', () => {
        ctx = new SlowFakeContext();

        const a = audio();

        a.unlock();

        expect(ctx.state).toBe('suspended');
        expect(a.play('beep')).toBe(false);
        expect(ctx.oscillators).toHaveLength(0);
    });

    it('plays once the resume has settled, without replaying what it dropped', async () => {
        ctx = new SlowFakeContext();

        const a = audio();

        a.unlock();
        a.play('beep');

        await Promise.resolve();

        expect(ctx.state).toBe('running');
        expect(a.play('beep')).toBe(true);
        expect(ctx.oscillators).toHaveLength(1);
    });
});

/**
 * The gesture hook (F18 §1). Without a caller the whole feature is inert, and
 * the failure is silent — so the hook is a function with a test rather than
 * three lines buried in `main.ts`.
 */
describe('unlockOnGesture', () => {
    class FakeWindow {
        readonly listeners = new Map<string, Set<() => void>>();

        addEventListener(type: string, fn: () => void): void {
            const set = this.listeners.get(type) ?? new Set<() => void>();

            set.add(fn);
            this.listeners.set(type, set);
        }

        removeEventListener(type: string, fn: () => void): void {
            this.listeners.get(type)?.delete(fn);
        }

        fire(type: string): void {
            for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
        }

        count(): number {
            let total = 0;

            for (const set of this.listeners.values()) total += set.size;

            return total;
        }
    }

    it('listens for both gestures a player can make first', () => {
        const target = new FakeWindow();

        unlockOnGesture(target, audio());

        expect([...target.listeners.keys()].sort()).toEqual(['keydown', 'pointerdown']);
    });

    it('unlocks on the first press, so the next cue sounds', () => {
        const target = new FakeWindow();
        const a = audio();

        unlockOnGesture(target, a);

        expect(a.unlocked).toBe(false);

        target.fire('keydown');

        expect(a.unlocked).toBe(true);
        expect(a.play('tick')).toBe(true);
    });

    /**
     * It stays attached rather than firing once: `unlock()` is idempotent, and a
     * context the browser suspended on a tab blur is resumed by the next key the
     * player presses without anything else having to notice.
     */
    it('stays attached so a later gesture resumes a context the browser suspended', () => {
        const target = new FakeWindow();
        const a = audio();

        unlockOnGesture(target, a);
        target.fire('pointerdown');
        ctx.state = 'suspended';
        target.fire('pointerdown');

        expect(made).toBe(1);
        expect(ctx.resumes).toBe(2);
    });

    it('detaches both listeners when asked', () => {
        const target = new FakeWindow();
        const off = unlockOnGesture(target, audio());

        off();

        expect(target.count()).toBe(0);
    });
});

describe('the master bus', () => {
    /**
     * Six poles going gold in one shift change fires six `warn` voices at one
     * `currentTime`; at 0.26 each that clips on the destination and reads as a
     * crackle rather than as an alarm. One node, made once at the unlock.
     */
    it('puts a limiter between the master gain and the destination', () => {
        const limited = new CompressingFakeContext();

        ctx = limited;

        const a = audio();

        a.unlock();

        const [compressor] = limited.compressors;

        expect(limited.compressors).toHaveLength(1);
        expect(limited.gains[0]?.targets).toEqual([compressor]);
        expect(compressor?.targets).toEqual([limited.destination]);
    });

    it('connects straight to the destination on an engine with no compressor', () => {
        const a = audio();

        a.unlock();

        expect(ctx.gains[0]?.targets).toEqual([ctx.destination]);
    });

    it('makes no second limiter however many cues play', () => {
        const limited = new CompressingFakeContext();

        ctx = limited;

        const a = audio();

        a.unlock();
        a.play('tick');
        a.play('perfect');

        expect(limited.compressors).toHaveLength(1);
    });
});

describe('the no-op fallback', () => {
    it('is unavailable and silent when the browser has no AudioContext', () => {
        const a = audio({ context: () => null });

        a.unlock();

        expect(a.available).toBe(false);
        expect(a.play('tick')).toBe(false);
        expect(a.afterMs('tick', 100)).toBe(false);
        expect(a.at('tick', 12, 12)).toBe(false);
    });

    it('stays unavailable rather than propagating a constructor that throws', () => {
        const a = audio({
            context: () => {
                throw new Error('not allowed here');
            },
        });

        expect(() => a.unlock()).not.toThrow();
        expect(a.available).toBe(false);
        expect(a.play('tick')).toBe(false);
    });

    it('still tracks volume and mute with no context, so the controls never lie', () => {
        const a = audio({ context: () => null });

        a.unlock();
        a.setVolume(0.3);

        expect(a.settings().volume).toBe(0.3);
        expect(a.toggleMute()).toBe(true);
    });
});

describe('playing a cue', () => {
    it('builds one oscillator and one gain per voice', () => {
        const a = audio();

        a.unlock();
        a.play('tick');

        expect(ctx.oscillators).toHaveLength(1);
        expect(cueGains(ctx)).toHaveLength(1);

        a.play('perfect');

        expect(ctx.oscillators).toHaveLength(3);
        expect(cueGains(ctx)).toHaveLength(3);
    });

    it('takes the wave and the pitch from the table', () => {
        const a = audio();

        a.unlock();
        a.play('miss');

        const osc = ctx.oscillators[0];

        expect(osc?.type).toBe('sawtooth');
        expect(osc?.frequency.calls[0]).toEqual({ method: 'set', value: 160, at: 100 });
    });

    it('glides a two-pitch voice to its target by the end of the hold', () => {
        const a = audio();
        const voice = CUES.thunk.voices[0];

        a.unlock();
        a.play('thunk');

        const ramp = ctx.oscillators[0]?.frequency.calls[1];

        expect(ramp?.method).toBe('exp');
        expect(ramp?.value).toBe(45);
        expect(ramp?.at).toBeCloseTo(
            100 + ((voice?.attackMs ?? 0) + (voice?.holdMs ?? 0)) / 1000,
            10,
        );
    });

    it('starts the two voices of a confirm at their own offsets', () => {
        const a = audio();

        a.unlock();
        a.play('perfect');

        expect(ctx.oscillators[0]?.startedAt).toBe(100);
        expect(ctx.oscillators[1]?.startedAt).toBeCloseTo(100.07, 10);
    });

    it('envelopes every voice and never ramps exponentially to zero', () => {
        const a = audio();

        a.unlock();
        a.play('beep');

        const calls = cueGains(ctx)[0]?.gain.calls ?? [];

        expect(calls[0]).toEqual({ method: 'set', value: MIN_GAIN, at: 100 });
        expect(calls[1]?.method).toBe('linear');
        expect(calls[3]?.method).toBe('exp');
        expect(calls[3]?.value).toBe(MIN_GAIN);
        expect(calls[4]).toEqual({ method: 'set', value: 0, at: calls[3]?.at });
    });

    it('stops the oscillator at the end of its own envelope', () => {
        const a = audio();
        const voice = CUES.beep.voices[0];
        const length =
            ((voice?.attackMs ?? 0) + (voice?.holdMs ?? 0) + (voice?.releaseMs ?? 0)) / 1000;

        a.unlock();
        a.play('beep');

        expect(ctx.oscillators[0]?.stoppedAt).toBeCloseTo(100 + length, 10);
    });

    it('disconnects the pair once the note has ended', () => {
        const a = audio();

        a.unlock();
        a.play('tick');
        ctx.oscillators[0]?.end();

        expect(ctx.oscillators[0]?.disconnects).toBe(1);
        expect(cueGains(ctx)[0]?.disconnects).toBe(1);
    });
});

describe('volume and mute', () => {
    it('makes the master gain once, at the unlock, from the stored volume', () => {
        storage.seed(JSON.stringify({ volume: 0.4, muted: false }));

        const a = audio();

        a.unlock();

        expect(a.settings().volume).toBe(0.4);
        expect(ctx.gains[0]?.gain.value).toBe(0.4);
        expect(ctx.gains).toHaveLength(1);
    });

    it('sets the master gain on a change and creates no node to do it', () => {
        const a = audio();

        a.unlock();
        a.setVolume(0.25);

        expect(ctx.gains).toHaveLength(1);
        expect(ctx.gains[0]?.gain.value).toBe(0.25);
    });

    it('scales a cue by the callers own gain and leaves the master alone', () => {
        const a = audio();
        const peak = CUES.alarm.voices[0]?.peak ?? 0;

        a.unlock();
        a.play('alarm', 0.5);

        expect(cueGains(ctx)[0]?.gain.calls[1]?.value).toBeCloseTo(peak * 0.5, 10);
        expect(ctx.gains[0]?.gain.value).toBe(DEFAULT_AUDIO_SETTINGS.volume);
    });

    it('creates nothing at all while muted', () => {
        const a = audio();

        a.unlock();
        a.setMuted(true);

        expect(a.play('tick')).toBe(false);
        expect(ctx.oscillators).toHaveLength(0);
        expect(ctx.gains[0]?.gain.value).toBe(0);
    });

    it('restores the volume the player chose when the mute comes off', () => {
        const a = audio();

        a.unlock();
        a.setVolume(0.35);
        expect(a.toggleMute()).toBe(true);
        expect(a.toggleMute()).toBe(false);

        expect(a.settings().volume).toBe(0.35);
        expect(ctx.gains[0]?.gain.value).toBe(0.35);
    });

    it('remembers a volume set before the unlock', () => {
        const a = audio();

        a.setVolume(0.15);
        a.unlock();

        expect(ctx.gains[0]?.gain.value).toBe(0.15);
    });

    it('nudges on the grid', () => {
        const a = audio();

        expect(a.nudgeVolume(1)).toBe(0.75);
        expect(a.nudgeVolume(-1)).toBe(0.7);
    });
});

describe('scheduling', () => {
    it('books a cue at the context clock plus the delta', () => {
        const a = audio();

        a.unlock();

        expect(a.afterMs('tick', 400)).toBe(true);
        expect(ctx.oscillators[0]?.startedAt).toBeCloseTo(100.4, 10);
    });

    it('converts a FactoryState clock second against the caller own server now', () => {
        const a = audio();

        a.unlock();

        expect(a.at('tick', 42.4, 42)).toBe(true);
        expect(ctx.oscillators[0]?.startedAt).toBeCloseTo(100.4, 10);
    });

    it('drops a stale cue instead of letting WebAudio fire it immediately', () => {
        const a = audio();

        a.unlock();

        expect(a.afterMs('tick', -MAX_LATE_MS - 1)).toBe(false);
        expect(a.at('tick', 41, 42)).toBe(false);
        expect(ctx.oscillators).toHaveLength(0);
    });

    it('plays a cue a frame late on the beat rather than dropping it', () => {
        const a = audio();

        a.unlock();

        expect(a.afterMs('tick', -10)).toBe(true);
        expect(ctx.oscillators[0]?.startedAt).toBe(100);
    });

    it('refuses a cue booked past the horizon the clock estimate is good for', () => {
        const a = audio();

        a.unlock();

        expect(a.afterMs('tick', MAX_SCHEDULE_AHEAD_MS + 1)).toBe(false);
        expect(ctx.oscillators).toHaveLength(0);
    });
});

describe('persistence', () => {
    it('starts on the defaults with an empty store', () => {
        expect(audio().settings()).toEqual(DEFAULT_AUDIO_SETTINGS);
    });

    it('round-trips through the store', () => {
        const a = audio();

        a.setVolume(0.45);
        a.setMuted(true);

        expect(audio().settings()).toEqual({ volume: 0.45, muted: true });
    });

    it('leaves the defaults in place when getItem throws, as it does in a private window', () => {
        const blocked = new FakeStorage(true, false);

        expect(audio({ storage: blocked }).settings()).toEqual(DEFAULT_AUDIO_SETTINGS);
    });

    it('does not propagate a setItem that throws', () => {
        const blocked = new FakeStorage(false, true);
        const a = audio({ storage: blocked });

        expect(() => a.setVolume(0.2)).not.toThrow();
        expect(a.settings().volume).toBe(0.2);
    });

    it('coerces a corrupt payload rather than throwing', () => {
        storage.seed('{not json');

        expect(audio().settings()).toEqual(DEFAULT_AUDIO_SETTINGS);
    });

    it("keeps F13's other settings in the key it shares with them", () => {
        storage.seed(
            JSON.stringify({ volume: 0.1, muted: false, reducedMotion: true, uiScale: 1.25 }),
        );

        const a = audio();

        a.setVolume(0.9);

        expect(JSON.parse(storage.raw() ?? '{}')).toEqual({
            volume: 0.9,
            muted: false,
            reducedMotion: true,
            uiScale: 1.25,
        });
    });

    it('works with no store at all', () => {
        const a = audio({ storage: null });

        expect(a.settings()).toEqual(DEFAULT_AUDIO_SETTINGS);
        expect(() => a.setVolume(0.5)).not.toThrow();
        expect(a.settings().volume).toBe(0.5);
    });
});
