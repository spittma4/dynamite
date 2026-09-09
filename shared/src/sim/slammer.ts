/**
 * The Slammer's maths (docs/04 "The Slammer", F07). Heat is a *greed ceiling*:
 * how fast the player chose to mash sets both how fast the gauge climbs and how
 * small their own OK window is. Everything here is pure so the overlay can
 * predict the needle from the same numbers the server judges with — and so the
 * one thing that must never scale, the ±50 ms dead centre, is visible in one
 * place as a constant the interpolation never touches.
 */

export type Chute = 'l' | 'u' | 'r';
export type SlammerPhase = 'idle' | 'mash' | 'charge' | 'hands';
export type SlammerOutcome = '' | 'dead_center' | 'prime' | 'late' | 'early';

/** `HeatConfig` with contracts §13's optional `overholdMs` already resolved. */
export interface SlammerHeatConfig {
    minChargeSeconds: number;
    maxChargeSeconds: number;
    okMsAtMaxCharge: number;
    okMsAtMinCharge: number;
    deadCenterMs: number;
    churnBandDrift: number;
    overholdMs: number;
}

/** Everything the overlay draws, and nothing the judge keeps to itself. */
export interface SlammerMg {
    phase: SlammerPhase;
    /** Chutes pressed this cycle, in press order (0–3 entries). */
    mashed: Chute[];
    /** Clock seconds the charge began; 0 outside `charge`. */
    chargeStartAt: number;
    tCharge: number;
    okMs: number;
    /** 0 lazy … 1 hot; the last charge's heat, kept until the next one. */
    heat: number;
    bandOffset: number;
    combo: number;
    tier: 0 | 1 | 2 | 3;
    lastOutcome: SlammerOutcome;
    /** Signed ms of the last release: + late, − early. */
    lastErrorMs: number;
    cfg: SlammerHeatConfig;
}

/**
 * Fixed by the `ItemState.quality` contract and by the Jig's
 * `pour.beatsByQuality` keys, so these are not a designer's dial.
 */
export const KEG_QUALITY = { dud: 0.4, damp: 0.7, prime: 1.0 } as const;

const PHASES: readonly SlammerPhase[] = ['idle', 'mash', 'charge', 'hands'];
const OUTCOMES: readonly SlammerOutcome[] = ['', 'dead_center', 'prime', 'late', 'early'];
const CHUTES: readonly Chute[] = ['l', 'u', 'r'];

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/** Where `tCharge` sits between the hot and lazy climbs: 0 hot, 1 lazy. */
function climbFraction(tCharge: number, cfg: SlammerHeatConfig): number {
    const span = cfg.maxChargeSeconds - cfg.minChargeSeconds;

    if (span <= 0) return 0;

    return clamp((tCharge - cfg.minChargeSeconds) / span, 0, 1);
}

export function chargeSeconds(tMashSeconds: number, cfg: SlammerHeatConfig): number {
    return clamp(2 * tMashSeconds, cfg.minChargeSeconds, cfg.maxChargeSeconds);
}

export function okWindowMs(tCharge: number, cfg: SlammerHeatConfig): number {
    const u = climbFraction(tCharge, cfg);

    return cfg.okMsAtMinCharge + (cfg.okMsAtMaxCharge - cfg.okMsAtMinCharge) * u;
}

export function heatOf(tCharge: number, cfg: SlammerHeatConfig): number {
    return 1 - climbFraction(tCharge, cfg);
}

export function targetMs(tCharge: number, bandOffset: number): number {
    return tCharge * 1000 * (1 + bandOffset);
}

/**
 * The drawn gauge is a fixed length, so a hot mash puts a smaller band nearer
 * the left and the greed is legible before the release rather than after it.
 */
export function gaugeTopMs(cfg: SlammerHeatConfig): number {
    return (
        cfg.maxChargeSeconds * 1000 * (1 + cfg.churnBandDrift) + cfg.okMsAtMaxCharge + cfg.overholdMs
    );
}

/** Both bounds inclusive; `deadCenterMs` never scales with heat (docs/04). */
export function judgeRelease(
    errorMs: number,
    okMs: number,
    deadCenterMs: number,
): Exclude<SlammerOutcome, ''> {
    const off = Math.abs(errorMs);

    if (off <= deadCenterMs) return 'dead_center';
    if (off <= okMs) return 'prime';

    return errorMs > 0 ? 'late' : 'early';
}

export function kegFor(outcome: Exclude<SlammerOutcome, ''>): { quality: number; prime: boolean } {
    if (outcome === 'dead_center') return { quality: KEG_QUALITY.prime, prime: true };
    if (outcome === 'prime') return { quality: KEG_QUALITY.prime, prime: false };
    if (outcome === 'late') return { quality: KEG_QUALITY.damp, prime: false };

    return { quality: KEG_QUALITY.dud, prime: false };
}

/** Flat in the Churn: friction the player has to read, never a lockout. */
export function bandDrift(
    groove: number,
    churnThreshold: number,
    churnBandDrift: number,
    r: number,
): number {
    if (groove > churnThreshold) return 0;

    return churnBandDrift * (2 * r - 1);
}

export function comboTier(combo: number, tiers: readonly number[]): 0 | 1 | 2 | 3 {
    let reached = 0;

    for (const tier of tiers) {
        if (combo >= tier) reached++;
    }

    return Math.min(reached, 3) as 0 | 1 | 2 | 3;
}

/**
 * Both presses were timed by one client on one `performance.now()` base, so
 * latency cancels and only jitter is left. The server's own measurement is
 * quantised by a 50 ms tick, which is why the tolerance is the ok floor.
 */
export function boundedMs(clientMs: number, serverMs: number, toleranceMs: number): number {
    if (!Number.isFinite(clientMs) || clientMs < 0) return serverMs;

    return clamp(clientMs, serverMs - toleranceMs, serverMs + toleranceMs);
}

export function idleMg(cfg: SlammerHeatConfig, bandOffset: number): SlammerMg {
    return {
        phase: 'idle',
        mashed: [],
        chargeStartAt: 0,
        tCharge: 0,
        okMs: 0,
        heat: 0,
        bandOffset,
        combo: 0,
        tier: 0,
        lastOutcome: '',
        lastErrorMs: 0,
        cfg: { ...cfg },
    };
}

export function encodeMg(mg: SlammerMg): string {
    return JSON.stringify(mg);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberAt(source: Record<string, unknown>, key: string): number | null {
    const value = source[key];

    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function heatFrom(value: unknown): SlammerHeatConfig | null {
    if (!isRecord(value)) return null;

    const keys: (keyof SlammerHeatConfig)[] = [
        'minChargeSeconds',
        'maxChargeSeconds',
        'okMsAtMaxCharge',
        'okMsAtMinCharge',
        'deadCenterMs',
        'churnBandDrift',
        'overholdMs',
    ];
    const cfg = {} as SlammerHeatConfig;

    for (const key of keys) {
        const found = numberAt(value, key);

        if (found === null) return null;

        cfg[key] = found;
    }

    return cfg;
}

function mashedFrom(value: unknown): Chute[] | null {
    if (!Array.isArray(value) || value.length > 3) return null;

    const mashed: Chute[] = [];

    for (const entry of value) {
        if (typeof entry !== 'string') return null;

        const chute = CHUTES.find((c) => c === entry);

        if (chute === undefined) return null;

        mashed.push(chute);
    }

    return mashed;
}

/** The client's parse: a stale or malformed value is `null`, never a throw. */
export function decodeMg(s: string): SlammerMg | null {
    let parsed: unknown;

    try {
        parsed = JSON.parse(s);
    } catch {
        return null;
    }

    if (!isRecord(parsed)) return null;

    const phase = PHASES.find((p) => p === parsed.phase);
    const lastOutcome = OUTCOMES.find((o) => o === parsed.lastOutcome);
    const mashed = mashedFrom(parsed.mashed);
    const cfg = heatFrom(parsed.cfg);
    const tier = numberAt(parsed, 'tier');

    if (phase === undefined || lastOutcome === undefined) return null;
    if (mashed === null || cfg === null) return null;
    if (tier === null || tier < 0 || tier > 3 || !Number.isInteger(tier)) return null;

    const chargeStartAt = numberAt(parsed, 'chargeStartAt');
    const tCharge = numberAt(parsed, 'tCharge');
    const okMs = numberAt(parsed, 'okMs');
    const heat = numberAt(parsed, 'heat');
    const bandOffset = numberAt(parsed, 'bandOffset');
    const combo = numberAt(parsed, 'combo');
    const lastErrorMs = numberAt(parsed, 'lastErrorMs');

    if (chargeStartAt === null || tCharge === null || okMs === null || heat === null) return null;
    if (bandOffset === null || combo === null || lastErrorMs === null) return null;

    return {
        phase,
        mashed,
        chargeStartAt,
        tCharge,
        okMs,
        heat,
        bandOffset,
        combo,
        tier: tier as 0 | 1 | 2 | 3,
        lastOutcome,
        lastErrorMs,
        cfg,
    };
}
