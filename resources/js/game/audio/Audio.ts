import {
    type AudioSettings,
    CUES,
    type CueName,
    DEFAULT_AUDIO_SETTINGS,
    SETTINGS_KEY,
    type Voice,
    coerceAudioSettings,
    contextTimeFor,
    effectiveVolume,
    envelope,
    mergeAudioSettings,
    stepVolume,
    voiceDurationMs,
} from './cues';

/**
 * The client's one and only sound source (F18). Everything the game makes a
 * noise about goes through here: one `AudioContext`, one master gain, one
 * mute, one vocabulary — a second context would be a second autoplay problem
 * and a volume that ignored the first.
 *
 * The context is created lazily and resumed on a real user gesture, because a
 * context built before one starts `suspended` and drops every sound with no
 * error and no warning. Until that gesture every call here is a silent no-op
 * that queues nothing: a rhythm cue replayed late is worse than one not played.
 */

/** The slice of WebAudio F18 uses, narrow enough that a fake can stand in. */
export interface ParamOut {
    value: number;
    setValueAtTime(value: number, at: number): unknown;
    linearRampToValueAtTime(value: number, at: number): unknown;
    exponentialRampToValueAtTime(value: number, at: number): unknown;
}

export interface NodeOut {
    connect(target: NodeOut): unknown;
    disconnect(): unknown;
}

export interface GainOut extends NodeOut {
    readonly gain: ParamOut;
}

export interface OscOut extends NodeOut {
    type: string;
    readonly frequency: ParamOut;
    /**
     * `unknown` so a real `OscillatorNode` stays structurally assignable — its
     * handler carries a `this` and an `Event` that nothing here reads.
     */
    onended: unknown;
    start(at: number): unknown;
    stop(at: number): unknown;
}

export interface AudioOut {
    readonly currentTime: number;
    readonly state: string;
    readonly destination: NodeOut;
    resume(): PromiseLike<void> | void;
    createOscillator(): OscOut;
    createGain(): GainOut;
    /**
     * Optional so a fake need not grow a node it does not care about, and so an
     * engine without one still plays. See `Engine.unlock`.
     */
    createDynamicsCompressor?(): NodeOut;
}

/** `window`'s two methods, narrow enough that a test never needs a DOM. */
export interface GestureTarget {
    addEventListener(type: string, listener: () => void, options?: { passive?: boolean }): void;
    removeEventListener(type: string, listener: () => void): void;
}

/** The gestures a browser accepts as "the player is here" for autoplay. */
const GESTURES = ['pointerdown', 'keydown'] as const;

/** `localStorage`'s two methods, so a test never has to touch the global. */
export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export interface GameAudio {
    /**
     * False once we know this browser cannot play at all — which is only
     * knowable after `unlock()` has tried to build a context. Callers do not
     * need it: every method is already a no-op when it is false.
     */
    readonly available: boolean;
    readonly unlocked: boolean;
    settings(): AudioSettings;
    setVolume(volume: number): void;
    setMuted(muted: boolean): void;
    toggleMute(): boolean;
    nudgeVolume(delta: number): number;
    /** Call from a real user gesture. Idempotent. */
    unlock(): void;
    /** Now. `gain` is the caller's own multiplier. Returns whether it sounded. */
    play(cue: CueName, gain?: number): boolean;
    /** `deltaMs` from now, on the same clock the caller measured it against. */
    afterMs(cue: CueName, deltaMs: number, gain?: number): boolean;
    /** A `FactoryState.clock` second, against the caller's own `serverNow`. */
    at(cue: CueName, atSeconds: number, serverNow: number, gain?: number): boolean;
}

export interface AudioDeps {
    context?: () => AudioOut | null;
    storage?: StorageLike | null;
}

/**
 * The return type is what checks `AudioOut` against the real thing: a narrow
 * interface nothing is ever assigned to is an interface that can quietly stop
 * describing WebAudio.
 */
function defaultContext(): AudioOut | null {
    const ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;

    return ctor ? new ctor() : null;
}

function defaultStorage(): StorageLike | null {
    try {
        return (globalThis as { localStorage?: Storage }).localStorage ?? null;
    } catch {
        // Blocked storage throws on the property access itself, not on the read.
        return null;
    }
}

function readSettings(storage: StorageLike | null): AudioSettings {
    if (!storage) return { ...DEFAULT_AUDIO_SETTINGS };

    try {
        const raw = storage.getItem(SETTINGS_KEY);

        return coerceAudioSettings(raw === null ? null : JSON.parse(raw));
    } catch {
        return { ...DEFAULT_AUDIO_SETTINGS };
    }
}

/**
 * F13 keeps `reducedMotion`, `colourSafe` and `uiScale` under the same key, so
 * the two fields F18 owns are merged into whatever is already there.
 */
function writeSettings(storage: StorageLike | null, next: AudioSettings): void {
    if (!storage) return;

    try {
        const raw = storage.getItem(SETTINGS_KEY);
        const merged = mergeAudioSettings(raw === null ? null : JSON.parse(raw), next);

        storage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    } catch {
        // A private window, a full quota, a blocked origin: the setting still
        // holds for this session, it just does not outlive it.
    }
}

class Engine implements GameAudio {
    private readonly makeContext: () => AudioOut | null;
    private readonly storage: StorageLike | null;
    private readonly current: AudioSettings;

    private ctx: AudioOut | null = null;
    private master: GainOut | null = null;
    private tried = false;
    private failed = false;

    constructor(deps: AudioDeps) {
        this.makeContext = deps.context ?? defaultContext;
        this.storage = deps.storage === undefined ? defaultStorage() : deps.storage;
        this.current = readSettings(this.storage);
    }

    get available(): boolean {
        return !this.failed;
    }

    get unlocked(): boolean {
        return this.ctx !== null;
    }

    settings(): AudioSettings {
        return { ...this.current };
    }

    setVolume(volume: number): void {
        this.current.volume = Math.min(1, Math.max(0, volume));
        this.applyVolume();
    }

    setMuted(muted: boolean): void {
        this.current.muted = muted;
        this.applyVolume();
    }

    toggleMute(): boolean {
        this.setMuted(!this.current.muted);

        return this.current.muted;
    }

    nudgeVolume(delta: number): number {
        this.setVolume(stepVolume(this.current.volume, delta));

        return this.current.volume;
    }

    unlock(): void {
        if (this.tried) {
            this.resume();

            return;
        }

        this.tried = true;

        let ctx: AudioOut | null = null;

        try {
            ctx = this.makeContext();
        } catch {
            ctx = null;
        }

        if (!ctx) {
            this.failed = true;

            return;
        }

        const master = ctx.createGain();

        master.gain.value = effectiveVolume(this.current);

        // Nothing caps the summed voices: six poles going gold in one shift
        // change fires six `warn`s at one `currentTime`, which clips on the
        // destination and reads as a crackle rather than as an alarm. One node,
        // made once, no per-cue cost — and no asset, so §Out still holds.
        const limiter = ctx.createDynamicsCompressor?.();

        if (limiter) {
            master.connect(limiter);
            limiter.connect(ctx.destination);
        } else {
            master.connect(ctx.destination);
        }

        this.ctx = ctx;
        this.master = master;
        this.resume();
    }

    play(cue: CueName, gain = 1): boolean {
        return this.afterMs(cue, 0, gain);
    }

    at(cue: CueName, atSeconds: number, serverNow: number, gain = 1): boolean {
        return this.afterMs(cue, (atSeconds - serverNow) * 1000, gain);
    }

    afterMs(cue: CueName, deltaMs: number, gain = 1): boolean {
        const ctx = this.ctx;
        const master = this.master;

        if (!ctx || !master) return false;

        // A suspended context drops `start()` silently, so the cue is refused
        // rather than fired late once the resume lands.
        if (ctx.state !== 'running') {
            this.resume();

            return false;
        }

        if (this.current.muted || this.current.volume <= 0) return false;

        const level = Math.min(1, Math.max(0, gain));

        if (level <= 0) return false;

        const startAt = contextTimeFor(deltaMs, ctx.currentTime);

        if (startAt === null) return false;

        for (const voice of CUES[cue].voices) this.voice(ctx, master, voice, startAt, level);

        return true;
    }

    private voice(
        ctx: AudioOut,
        master: GainOut,
        voice: Voice,
        startAt: number,
        level: number,
    ): void {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = voice.wave;
        osc.frequency.setValueAtTime(voice.freq, startAt + voice.atMs / 1000);

        if (voice.toFreq !== undefined) {
            osc.frequency.exponentialRampToValueAtTime(
                voice.toFreq,
                startAt + (voice.atMs + voice.attackMs + voice.holdMs) / 1000,
            );
        }

        for (const point of envelope(voice, startAt, level)) {
            if (point.ramp === 'set') gain.gain.setValueAtTime(point.value, point.at);
            else if (point.ramp === 'linear') gain.gain.linearRampToValueAtTime(point.value, point.at);
            else gain.gain.exponentialRampToValueAtTime(point.value, point.at);
        }

        osc.connect(gain);
        gain.connect(master);

        const from = startAt + voice.atMs / 1000;
        const until = startAt + voiceDurationMs(voice) / 1000;

        osc.onended = (): void => {
            osc.disconnect();
            gain.disconnect();
        };

        osc.start(from);
        osc.stop(until);
    }

    private applyVolume(): void {
        writeSettings(this.storage, this.current);

        if (this.master) this.master.gain.value = effectiveVolume(this.current);
    }

    private resume(): void {
        const ctx = this.ctx;

        if (!ctx || ctx.state === 'running') return;

        try {
            void Promise.resolve(ctx.resume()).catch(() => {});
        } catch {
            // Some engines throw synchronously on a closed context.
        }
    }
}

export function createAudio(deps: AudioDeps = {}): GameAudio {
    return new Engine(deps);
}

/** The one the game calls. `main.ts` hands it to `unlockOnGesture` at boot. */
export const gameAudio: GameAudio = createAudio();

/**
 * The line that makes every other line in F18 audible (§1). A context built
 * before a user gesture starts `suspended` and drops every `start()` with no
 * exception and no console warning, so the whole feature is inert until a real
 * press reaches `unlock()`.
 *
 * The listeners stay attached rather than firing once. `unlock()` is idempotent,
 * so the cost is one `state === 'running'` check per press, and the benefit is
 * that a context the browser suspended on a tab blur comes back on the next key
 * the player touches — without anything else in the client having to know.
 */
export function unlockOnGesture(target: GestureTarget, audio: GameAudio = gameAudio): () => void {
    const listener = (): void => audio.unlock();

    for (const gesture of GESTURES) target.addEventListener(gesture, listener, { passive: true });

    return () => {
        for (const gesture of GESTURES) target.removeEventListener(gesture, listener);
    };
}
