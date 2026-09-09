import type { AssemblyMinigame, Tile } from '../config/types';
import type { FxKind, MgOp } from '../messages';
import type { FuseLength, ItemType } from '../schema/types';
import { MAX_INPUT_BACKDATE_S } from './constants';

/**
 * The Jig (docs/04, F08). Two players and one phrase: A seats a casing, pours
 * to the mark, ties the knots the fuse asks for and crimps the cap on the third
 * ratchet click, while B picks a spool and tosses the set across the aisle. It
 * is the bottleneck of the line, so every judgement lives here as a pure
 * reducer over a tick view — no world, no clock, no Colyseus — and the server
 * adapter does nothing but hand it facts and spend the effects it returns.
 */

export type JigLane = 'l' | 'r';
export type JigGrade = 'perfect' | 'ok' | 'miss';
export type JigPhase = 'seat' | 'pour' | 'parts' | 'knots' | 'crimp';
export type JigBPhase = 'idle' | 'fetching' | 'holding' | 'swinging';
export type JigCradle = 'empty' | 'armed' | 'surface';
export type JigNote = '' | 'early' | 'late' | 'lane' | 'full' | 'body';

export interface JigWindow {
    perfectMs: number;
    okMs: number;
}

/** `StationConfig.minigame` for an assembly station plus the two level numbers it needs. */
export interface JigConfig extends Required<AssemblyMinigame> {
    bpm: number;
    /** `recipes.keg.output.pours` — how many sticks one keg is worth. */
    kegPours: number;
}

export interface JigTiles {
    jig: Tile[];
    rack: Tile[];
    aisle: Tile;
}

/** docs/06: a weak pour, the mark, and one that went over the top. */
const FILL_WEAK = 0.6;
const FILL_FULL = 1.0;
const FILL_OVERFILL = 1.2;
const OVERFILL_FRACTION = 0.2;
/** docs/04: an OK toss lands askew on the jig surface and A has to square it up. */
const SURFACE_TAX_SECONDS = 0.5;
const FETCH_SECONDS = 0.6;
const CRIMP_PROGRESS_SECONDS = 0.6;
const PRIME_QUALITY = 1;
const EPSILON = 1e-9;

/** What the overlay draws. Times are `FactoryState.clock` seconds (contracts §3). */
export interface JigMg {
    tiles: JigTiles;
    a: string;
    b: string;
    phase: JigPhase;
    bpm: number;
    beatStartAt: number;
    rearmFrom: number;
    rearmAt: number;
    seated: { dents: number; colour: 'red'; orderId: string } | null;
    fill: number;
    pour: { startAt: number; targetAt: number; beats: number; primeKeg: boolean } | null;
    keg: { quality: number; prime: boolean; poursLeft: number } | null;
    lanes: JigLane[];
    knotAt: number[];
    knotIndex: number;
    knotGrades: JigGrade[];
    crimpClickAt: number[];
    cradle: JigCradle;
    cradleFuse: FuseLength;
    surfaceReadyAt: number;
    bPhase: JigBPhase;
    bPick: FuseLength;
    bFetchDoneAt: number;
    swingStartAt: number;
    aisleBlocked: boolean;
    orderChip: { orderId: string; fuseLength: FuseLength }[];
    last: {
        who: 'a' | 'b';
        step: 'pour' | 'knot' | 'crimp' | 'toss';
        grade: JigGrade;
        note: JigNote;
        at: number;
    } | null;
    primeAt: number;
}

/** The public shape plus the fields that never leave the server. */
export interface JigState extends JigMg {
    cfg: JigConfig;
    kegItemId: string;
    aTile: Tile;
    /** The fuse of the set A is working, kept apart from a cradle B may refill mid-phrase. */
    workFuse: FuseLength;
    pourGrade: JigGrade | '';
    lastTickAt: number;
    /** The seat that opened this cycle, so a refusal knows what to put back. */
    pendingSeat: boolean;
}

export interface JigShelfEntry {
    index: number;
    itemId: string;
    type: ItemType;
    dents: number;
    quality: number;
    prime: boolean;
}

/** Everything the reducer is allowed to know about the world, built once per call. */
export interface JigTickView {
    now: number;
    dt: number;
    /** `ctx.paused` — an interrupt; the phrase waits where it stands. */
    paused: boolean;
    /** `ctx.phase === 'idle'` — what `ctx.beginCycle()` tests. */
    cycleIdle: boolean;
    rearmAt: number;
    /** sessionIds, earliest `Member.joinedAt` first. */
    operators: string[];
    rackHands: string[];
    shelf: JigShelfEntry[];
    casingCount: number;
    shelfRoom: number;
    activeOrderId: string;
    orders: { orderId: string; fuseLength: FuseLength }[];
    aisleFloorItem: boolean;
    bodyOnAisle: string;
    partsOnJigTile: { sessionId: string; itemId: string; fuseLength: FuseLength } | null;
    aTile: Tile;
    aCarrying: string;
    bCarrying: string;
    bParts: { itemId: string; fuseLength: FuseLength } | null;
}

export type JigEvent =
    | { t: 'tick'; view: JigTickView }
    | {
          t: 'input';
          sessionId: string;
          op: MgOp;
          v?: number | string;
          at: number;
          view: JigTickView;
      }
    | { t: 'leave'; sessionId: string }
    | { t: 'refused' };

export interface JigStickInit {
    quality: number;
    prime: boolean;
    dents: number;
    fuseLength: FuseLength;
    fill: number;
    capLoose: boolean;
    frayed: boolean;
    orderId: string;
}

export type JigEffect =
    | { e: 'beginCycle' }
    | { e: 'consume'; itemId: string }
    | { e: 'destroyItem'; itemId: string }
    | { e: 'stockCasing'; dents: number }
    | { e: 'createParts'; fuseLength: FuseLength; sessionId: string }
    | { e: 'partsToFloor'; itemId: string; tile: Tile }
    | { e: 'complete'; item: JigStickInit; perfect: boolean; handsOf: string }
    | { e: 'dropStick'; item: JigStickInit; origin: Tile; culpritId: string }
    | { e: 'abort' }
    | { e: 'spill'; tile: Tile }
    | { e: 'spark' }
    | { e: 'fx'; kind: FxKind; x: number; y: number }
    | { e: 'bubble'; sessionId: string }
    | { e: 'primeStick' }
    | { e: 'tally'; key: 'kegsUsed' | 'defects' };

export function judge(offsetMs: number, w: JigWindow): JigGrade {
    const off = Math.abs(offsetMs);

    if (off <= w.perfectMs) return 'perfect';
    if (off <= w.okMs) return 'ok';

    return 'miss';
}

/** A prime keg pours clean, so the mark is easier to hit as well as sooner. */
export function pourWindow(cfg: JigConfig['pour'], primeKeg: boolean): JigWindow {
    const scale = primeKeg ? cfg.primeKegWindowMultiplier : 1;

    return { perfectMs: cfg.perfectMs * scale, okMs: cfg.okMs * scale };
}

/**
 * The Slammer's sloppiness arriving at the bottleneck: damp powder takes seven
 * beats to pour and a dud eight, so a bad keg costs the Jig its rhythm.
 */
export function pourBeats(quality: number, beatsByQuality: Record<string, number>): number {
    let smallestKey = Number.POSITIVE_INFINITY;
    let smallestValue = 1;
    let chosenKey = Number.NEGATIVE_INFINITY;
    let chosen: number | null = null;

    for (const [key, beats] of Object.entries(beatsByQuality)) {
        const at = Number(key);

        if (!Number.isFinite(at)) continue;

        if (at < smallestKey) {
            smallestKey = at;
            smallestValue = beats;
        }

        if (at <= quality + EPSILON && at > chosenKey) {
            chosenKey = at;
            chosen = beats;
        }
    }

    return chosen ?? smallestValue;
}

export function nextBeat(clock: number, beatSeconds: number): number {
    return Math.ceil(clock / beatSeconds - EPSILON) * beatSeconds;
}

export function laneSequence(rng: () => number, count: number): JigLane[] {
    const lanes: JigLane[] = [];

    for (let i = 0; i < count; i++) lanes.push(rng() < 0.5 ? 'l' : 'r');

    return lanes;
}

/** The first marker needs a beat to slide in, so the knots start one beat late. */
export function knotTimes(startAt: number, count: number, secondsPerKnot: number): number[] {
    const times: number[] = [];

    for (let i = 1; i <= count; i++) times.push(startAt + i * secondsPerKnot);

    return times;
}

export function crimpClicks(lastKnotAt: number, clicks: number, clickSeconds: number): number[] {
    const times: number[] = [];

    for (let i = 1; i <= clicks; i++) times.push(lastKnotAt + i * clickSeconds);

    return times;
}

export function isFrayed(grades: JigGrade[]): boolean {
    return grades.filter((grade) => grade === 'miss').length >= 2;
}

/**
 * A PRIME pour is a Perfect tap on a 1.0 keg: the keg's own `prime` flag widens
 * the window but cannot launder damp powder into a prime stick.
 */
export function isPrimeStick(s: {
    dents: number;
    pourGrade: JigGrade | '';
    kegQuality: number;
    knotGrades: JigGrade[];
    crimpGrade: JigGrade;
}): boolean {
    return (
        s.dents === 0 &&
        s.pourGrade === 'perfect' &&
        s.kegQuality >= PRIME_QUALITY &&
        s.knotGrades.every((grade) => grade === 'perfect') &&
        s.crimpGrade === 'perfect'
    );
}

/** 1.0 at the mark, 1.2 where it goes over the top. */
export function pourFillAt(pour: { startAt: number; targetAt: number }, t: number): number {
    return (t - pour.startAt) / Math.max(pour.targetAt - pour.startAt, EPSILON);
}

/** The tile in `tiles` closest to `from`; ties go to the earlier tile. */
export function nearestTile(from: Tile, tiles: Tile[]): Tile {
    let best = tiles[0] ?? from;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const tile of tiles) {
        const distance = Math.hypot(tile[0] - from[0], tile[1] - from[1]);

        if (distance >= bestDistance) continue;

        bestDistance = distance;
        best = tile;
    }

    return best;
}

export function deriveAisleTile(rack: Tile, jig: Tile): Tile {
    return [Math.round((rack[0] + jig[0]) / 2), Math.round((rack[1] + jig[1]) / 2)];
}

export function createJigState(cfg: JigConfig, tiles: JigTiles): JigState {
    return {
        tiles,
        a: '',
        b: '',
        phase: 'seat',
        bpm: cfg.bpm,
        beatStartAt: 0,
        rearmFrom: 0,
        rearmAt: 0,
        seated: null,
        fill: 0,
        pour: null,
        keg: null,
        lanes: [],
        knotAt: [],
        knotIndex: 0,
        knotGrades: [],
        crimpClickAt: [],
        cradle: 'empty',
        cradleFuse: '',
        surfaceReadyAt: 0,
        bPhase: 'idle',
        bPick: 'long',
        bFetchDoneAt: 0,
        swingStartAt: 0,
        aisleBlocked: false,
        orderChip: [],
        last: null,
        primeAt: 0,
        cfg,
        kegItemId: '',
        aTile: tiles.jig[0] ?? [0, 0],
        workFuse: '',
        pourGrade: '',
        lastTickAt: 0,
        pendingSeat: false,
    };
}

function round3(v: number): number {
    return Math.round(v * 1000) / 1000;
}

/** Only the public half, so `st.mg` never carries an item id or the config. */
export function toMg(state: JigState): JigMg {
    return {
        tiles: state.tiles,
        a: state.a,
        b: state.b,
        phase: state.phase,
        bpm: state.bpm,
        beatStartAt: round3(state.beatStartAt),
        rearmFrom: round3(state.rearmFrom),
        rearmAt: round3(state.rearmAt),
        seated: state.seated === null ? null : { ...state.seated },
        fill: state.fill,
        pour:
            state.pour === null
                ? null
                : {
                      startAt: round3(state.pour.startAt),
                      targetAt: round3(state.pour.targetAt),
                      beats: state.pour.beats,
                      primeKeg: state.pour.primeKeg,
                  },
        keg: state.keg === null ? null : { ...state.keg },
        lanes: [...state.lanes],
        knotAt: state.knotAt.map(round3),
        knotIndex: state.knotIndex,
        knotGrades: [...state.knotGrades],
        crimpClickAt: state.crimpClickAt.map(round3),
        cradle: state.cradle,
        cradleFuse: state.cradleFuse,
        surfaceReadyAt: round3(state.surfaceReadyAt),
        bPhase: state.bPhase,
        bPick: state.bPick,
        bFetchDoneAt: round3(state.bFetchDoneAt),
        swingStartAt: round3(state.swingStartAt),
        aisleBlocked: state.aisleBlocked,
        orderChip: state.orderChip.map((chip) => ({ ...chip })),
        last: state.last === null ? null : { ...state.last, at: round3(state.last.at) },
        primeAt: round3(state.primeAt),
    };
}

function clamp01(v: number): number {
    return Math.min(1, Math.max(0, v));
}

function beatSeconds(state: JigState): number {
    return 60 / state.cfg.bpm;
}

function knotCount(state: JigState, fuse: FuseLength): number {
    return fuse === 'short' ? state.cfg.knots.short : state.cfg.knots.long;
}

function hasCasing(view: JigTickView): boolean {
    return view.shelf.some((entry) => entry.type === 'casing');
}

function pourAvailable(state: JigState, view: JigTickView): boolean {
    if (state.keg !== null && state.keg.poursLeft > 0) return true;

    return view.shelf.some((entry) => entry.type === 'keg');
}

/** A 20 Hz tick rarely lands exactly on a beat, so a threshold on the grid still counts. */
function reached(now: number, at: number): boolean {
    return now >= at - EPSILON;
}

/** A beat stays open for its OK window plus the backdate the server tolerates. */
function closesAt(target: number, okMs: number): number {
    return target + okMs / 1000 + MAX_INPUT_BACKDATE_S;
}

function overfillAt(pour: { startAt: number; targetAt: number }): number {
    return pour.targetAt + OVERFILL_FRACTION * (pour.targetAt - pour.startAt);
}

export function stationStatus(
    state: JigState,
    view: JigTickView,
): { state: 'idle' | 'starved' | 'working'; progress: number } {
    const rearming = view.now < view.rearmAt;
    const starved =
        (state.phase === 'seat' &&
            state.a !== '' &&
            !rearming &&
            (!hasCasing(view) || !pourAvailable(state, view))) ||
        (state.phase === 'pour' && state.pour === null) ||
        (state.phase === 'parts' && state.cradle === 'empty');

    if (starved) return { state: 'starved', progress: 0 };
    if (state.phase !== 'seat' || rearming) {
        return { state: 'working', progress: progressOf(state, view, rearming) };
    }

    return { state: 'idle', progress: 0 };
}

function progressOf(state: JigState, view: JigTickView, rearming: boolean): number {
    if (state.phase === 'seat') {
        if (!rearming) return 0;

        const span = Math.max(view.rearmAt - state.rearmFrom, 0.001);

        return clamp01((view.now - state.rearmFrom) / span);
    }

    if (state.phase === 'pour') {
        const fill = state.pour === null ? 0 : Math.min(pourFillAt(state.pour, view.now), 1);

        return 0.25 + 0.25 * clamp01(fill);
    }

    if (state.phase === 'parts') return 0.5;

    if (state.phase === 'knots') {
        const n = Math.max(state.lanes.length, 1);

        return 0.5 + 0.25 * clamp01(state.knotIndex / n);
    }

    return 0.75 + 0.25 * clamp01((view.now - state.beatStartAt) / CRIMP_PROGRESS_SECONDS);
}

export function reduceJig(state: JigState, event: JigEvent, rng: () => number): JigEffect[] {
    if (event.t === 'tick') return onTick(state, event.view, rng);
    if (event.t === 'input') {
        return onInput(state, event.view, event.sessionId, event.op, event.v, event.at);
    }
    if (event.t === 'leave') return onLeave(state, event.sessionId);

    return onRefused(state);
}

/**
 * A pause or a blocked span moves the phrase, it does not cancel it: every beat
 * still ahead of the player slides by the time the machine stole. The re-arm bar
 * is F05's and is never touched.
 */
function shiftPending(state: JigState, by: number): void {
    if (by <= 0) return;

    state.beatStartAt += by;

    if (state.phase === 'pour' && state.pour !== null) {
        state.pour.startAt += by;
        state.pour.targetAt += by;
    }

    if (state.phase === 'knots') {
        for (let i = state.knotIndex; i < state.knotAt.length; i++) {
            state.knotAt[i] = (state.knotAt[i] ?? 0) + by;
        }
    }

    if (state.phase === 'crimp') {
        state.crimpClickAt = state.crimpClickAt.map((at) => at + by);
    }

    if (state.cradle === 'surface') state.surfaceReadyAt += by;
    if (state.bPhase === 'fetching') state.bFetchDoneAt += by;
    if (state.bPhase === 'swinging') state.swingStartAt += by;
}

function onTick(state: JigState, view: JigTickView, rng: () => number): JigEffect[] {
    const effects: JigEffect[] = [];
    const gap = state.lastTickAt === 0 ? 0 : view.now - state.lastTickAt - view.dt;

    shiftPending(state, gap);
    state.lastTickAt = view.now;
    state.rearmAt = view.rearmAt;
    state.aisleBlocked = view.aisleFloorItem;
    state.orderChip = view.orders.slice(0, 2).map((order) => ({ ...order }));

    if (view.paused) {
        shiftPending(state, view.dt);

        return effects;
    }

    reconcileRoles(state, view, effects);
    feed(state, view, effects, rng);
    takeFromHands(state, view, effects);
    advanceB(state, view, effects);
    advancePhrase(state, view, effects, rng);
    resumeCycle(state, view, effects);

    return effects;
}

function reconcileRoles(state: JigState, view: JigTickView, effects: JigEffect[]): void {
    const a = view.operators[0] ?? '';

    if (state.a !== '' && state.a !== a) {
        bail(state, effects);
        state.a = '';
    }

    state.a = a;

    const b = view.rackHands[0] ?? '';

    if (state.b !== b) {
        state.b = b;
        state.bFetchDoneAt = 0;
        state.swingStartAt = 0;
        state.bPhase = b !== '' && view.bParts !== null ? 'holding' : 'idle';

        if (b !== '') state.bPick = view.orders[0]?.fuseLength ?? 'long';
    }

    // A set that is still in B's hands — a toss with nowhere to land, or a
    // hauler who took the rack tile — is a swing waiting to happen.
    if (state.bPhase === 'idle' && view.bParts !== null) state.bPhase = 'holding';
}

/**
 * Casing Prep is M2, so the Jig feeds itself (contracts §13). One casing per
 * tick keeps the refill visible and the RNG draw order deterministic.
 */
function feed(
    state: JigState,
    view: JigTickView,
    effects: JigEffect[],
    rng: () => number,
): void {
    const { casings } = state.cfg;

    if (view.casingCount >= casings.stock || view.shelfRoom <= 0) return;

    const dents = rng() < casings.dentChance ? 1 + Math.floor(rng() * 2) : 0;

    effects.push({ e: 'stockCasing', dents });
}

/** The hauler and the solo player: carrying a set onto the jig arms the cradle. */
function takeFromHands(state: JigState, view: JigTickView, effects: JigEffect[]): void {
    const held = view.partsOnJigTile;

    if (state.cradle !== 'empty' || held === null) return;

    state.cradle = 'armed';
    state.cradleFuse = held.fuseLength;
    effects.push({ e: 'destroyItem', itemId: held.itemId });
}

function advanceB(state: JigState, view: JigTickView, effects: JigEffect[]): void {
    if (state.bPhase === 'fetching' && reached(view.now, state.bFetchDoneAt)) {
        effects.push({ e: 'createParts', fuseLength: state.bPick, sessionId: state.b });
        state.bPhase = 'holding';

        return;
    }

    if (state.bPhase !== 'swinging') return;

    const { toss } = state.cfg;

    if (reached(view.now, closesAt(state.swingStartAt + toss.arcSeconds, toss.okMs))) {
        resolveToss(state, view, view.now, effects);
    }
}

function advancePhrase(
    state: JigState,
    view: JigTickView,
    effects: JigEffect[],
    rng: () => number,
): void {
    if (state.a === '') return;

    if (state.phase === 'pour') {
        if (state.pour === null) {
            startPour(state, view, effects);

            return;
        }

        if (reached(view.now, overfillAt(state.pour))) {
            resolvePour(state, overfillAt(state.pour), effects);
        }

        return;
    }

    if (state.phase === 'parts') {
        if (state.cradle === 'surface' && reached(view.now, state.surfaceReadyAt)) {
            state.cradle = 'armed';
        }
        if (state.cradle === 'armed') enterKnots(state, view, rng);

        return;
    }

    if (state.phase === 'knots') {
        const n = state.lanes.length;

        while (state.knotIndex < n) {
            const at = state.knotAt[state.knotIndex] ?? 0;

            if (!reached(view.now, closesAt(at, state.cfg.knots.okMs))) break;

            state.knotGrades.push('miss');
            state.last = { who: 'a', step: 'knot', grade: 'miss', note: 'late', at };
            state.knotIndex++;
        }

        if (state.knotIndex >= n) enterCrimp(state, view.now);

        return;
    }

    if (state.phase === 'crimp') {
        const third = state.crimpClickAt[state.crimpClickAt.length - 1] ?? view.now;

        const closed = closesAt(third, state.cfg.crimp.okMs);

        if (reached(view.now, closed)) finishStick(state, 'miss', 'late', closed, effects);
    }
}

/**
 * F05 closes the cycle when a work member walks off mid-phrase, so an A who
 * picks the phrase back up has to re-open one or the stick it finishes has
 * nowhere to go. It goes last, where a refusal costs the tick nothing.
 */
function resumeCycle(state: JigState, view: JigTickView, effects: JigEffect[]): void {
    if (state.a === '' || state.phase === 'seat' || !view.cycleIdle) return;

    state.pendingSeat = false;
    effects.push({ e: 'beginCycle' });
}

function startPour(state: JigState, view: JigTickView, effects: JigEffect[]): void {
    if (state.keg === null || state.keg.poursLeft <= 0) {
        const entry = view.shelf.find((item) => item.type === 'keg');

        if (entry === undefined) return;

        effects.push({ e: 'consume', itemId: entry.itemId }, { e: 'tally', key: 'kegsUsed' });
        state.kegItemId = entry.itemId;
        state.keg = { quality: entry.quality, prime: entry.prime, poursLeft: state.cfg.kegPours };
    }

    const beat = beatSeconds(state);
    const startAt = nextBeat(view.now, beat);
    const beats = pourBeats(state.keg.quality, state.cfg.pour.beatsByQuality);

    state.pour = {
        startAt,
        targetAt: startAt + beats * beat,
        beats,
        primeKeg: state.keg.prime,
    };
    state.beatStartAt = startAt;
    state.keg.poursLeft--;

    if (state.keg.poursLeft <= 0 && state.kegItemId !== '') {
        effects.push({ e: 'destroyItem', itemId: state.kegItemId });
        state.kegItemId = '';
    }
}

function resolvePour(state: JigState, at: number, effects: JigEffect[]): void {
    const pour = state.pour;

    if (pour === null) return;

    const offset = (at - pour.targetAt) * 1000;
    const grade = judge(offset, pourWindow(state.cfg.pour, pour.primeKeg));
    let note: JigNote = '';

    if (grade === 'miss' && offset < 0) {
        state.fill = FILL_WEAK;
        note = 'early';
    } else if (grade === 'miss') {
        state.fill = FILL_OVERFILL;
        note = 'late';
        effects.push({ e: 'spill', tile: state.aTile });
    } else {
        state.fill = FILL_FULL;
    }

    state.pourGrade = grade;
    state.last = { who: 'a', step: 'pour', grade, note, at };
    state.phase = 'parts';
}

function enterKnots(state: JigState, view: JigTickView, rng: () => number): void {
    const beat = beatSeconds(state);
    const startAt = nextBeat(view.now, beat);

    state.workFuse = state.cradleFuse === '' ? 'long' : state.cradleFuse;
    state.cradle = 'empty';
    state.cradleFuse = '';
    state.lanes = laneSequence(rng, knotCount(state, state.workFuse));
    state.knotAt = knotTimes(startAt, state.lanes.length, state.cfg.knots.secondsPerKnot);
    state.beatStartAt = startAt;
    state.knotIndex = 0;
    state.knotGrades = [];
    state.phase = 'knots';
}

function enterCrimp(state: JigState, fallback: number): void {
    const lastKnotAt = state.knotAt[state.knotAt.length - 1] ?? fallback;
    const { clicks, clickSeconds } = state.cfg.crimp;

    state.crimpClickAt = crimpClicks(lastKnotAt, clicks, clickSeconds);
    state.beatStartAt = lastKnotAt;
    state.phase = 'crimp';
}

function stickFrom(state: JigState, capLoose: boolean, prime: boolean): JigStickInit {
    return {
        quality: state.keg?.quality ?? 0,
        prime,
        dents: state.seated?.dents ?? 0,
        fuseLength: state.workFuse === '' ? 'long' : state.workFuse,
        fill: state.fill,
        capLoose,
        frayed: isFrayed(state.knotGrades),
        orderId: state.seated?.orderId ?? '',
    };
}

function clearJig(state: JigState): void {
    state.seated = null;
    state.fill = 0;
    state.pour = null;
    state.lanes = [];
    state.knotAt = [];
    state.knotGrades = [];
    state.knotIndex = 0;
    state.crimpClickAt = [];
    state.pourGrade = '';
    state.workFuse = '';
    state.pendingSeat = false;
}

function finishStick(
    state: JigState,
    grade: JigGrade,
    note: JigNote,
    at: number,
    effects: JigEffect[],
): void {
    const capLoose = grade === 'miss';

    if (capLoose && (state.seated?.dents ?? 0) > 0) effects.push({ e: 'spark' });

    const prime = isPrimeStick({
        dents: state.seated?.dents ?? 0,
        pourGrade: state.pourGrade,
        kegQuality: state.keg?.quality ?? 0,
        knotGrades: state.knotGrades,
        crimpGrade: grade,
    });
    const item = stickFrom(state, capLoose, prime);

    effects.push({ e: 'complete', item, perfect: prime, handsOf: state.a });

    if (item.capLoose || item.frayed || item.fill !== FILL_FULL) {
        effects.push({ e: 'tally', key: 'defects' });
    }

    if (prime) {
        effects.push({ e: 'primeStick' });
        state.primeAt = at;
    }

    state.last = { who: 'a', step: 'crimp', grade, note, at };
    clearJig(state);
    state.rearmFrom = at;
    state.phase = 'seat';
}

function onInput(
    state: JigState,
    view: JigTickView,
    sessionId: string,
    op: MgOp,
    v: number | string | undefined,
    at: number,
): JigEffect[] {
    const effects: JigEffect[] = [];

    if (view.paused) return effects;

    if (sessionId !== '' && sessionId === state.a) operatorInput(state, view, op, v, at, effects);
    if (sessionId !== '' && sessionId === state.b) rackInput(state, view, op, v, at, effects);

    return effects;
}

function operatorInput(
    state: JigState,
    view: JigTickView,
    op: MgOp,
    v: number | string | undefined,
    at: number,
    effects: JigEffect[],
): void {
    if (op === 'seat') {
        seat(state, view, v, effects);

        return;
    }

    if (op === 'pour' && state.phase === 'pour' && state.pour !== null) {
        resolvePour(state, at, effects);

        return;
    }

    if (op === 'knot' && state.phase === 'knots') {
        knot(state, v, at);

        return;
    }

    if (op === 'crimp' && state.phase === 'crimp') {
        const third = state.crimpClickAt[state.crimpClickAt.length - 1] ?? at;
        const offset = (at - third) * 1000;
        const grade = judge(offset, state.cfg.crimp);
        const note: JigNote = grade === 'miss' ? (offset < 0 ? 'early' : 'late') : '';

        finishStick(state, grade, note, at, effects);
    }
}

function seat(
    state: JigState,
    view: JigTickView,
    v: number | string | undefined,
    effects: JigEffect[],
): void {
    if (state.phase !== 'seat' || !view.cycleIdle) return;
    if (view.now < view.rearmAt || view.aCarrying !== '') return;

    const index = Number(v);
    const entry = view.shelf.find((item) => item.index === index);

    if (entry === undefined || entry.type !== 'casing') return;
    if (!pourAvailable(state, view)) return;

    state.pendingSeat = true;
    state.seated = { dents: entry.dents, colour: 'red', orderId: view.activeOrderId };
    state.aTile = view.aTile;
    state.fill = 0;
    state.pour = null;
    state.phase = 'pour';

    effects.push(
        { e: 'beginCycle' },
        { e: 'consume', itemId: entry.itemId },
        { e: 'destroyItem', itemId: entry.itemId },
    );
}

function knot(state: JigState, v: number | string | undefined, at: number): void {
    if (v !== 'l' && v !== 'r') return;

    const index = state.knotIndex;

    if (index >= state.lanes.length) return;

    const target = state.knotAt[index] ?? at;
    const offset = (at - target) * 1000;
    let grade: JigGrade = 'miss';
    let note: JigNote = 'lane';

    if (v === state.lanes[index]) {
        grade = judge(offset, state.cfg.knots);
        note = grade === 'miss' ? (offset < 0 ? 'early' : 'late') : '';
    }

    state.knotGrades.push(grade);
    state.knotIndex++;
    state.last = { who: 'a', step: 'knot', grade, note, at };

    if (state.knotIndex >= state.lanes.length) enterCrimp(state, at);
}

function rackInput(
    state: JigState,
    view: JigTickView,
    op: MgOp,
    v: number | string | undefined,
    at: number,
    effects: JigEffect[],
): void {
    if (op === 'pick') {
        if (v === 'short' || v === 'long') state.bPick = v;

        return;
    }

    if (op === 'fetch') {
        if (state.bPhase !== 'idle' || view.bCarrying !== '') return;

        state.bPhase = 'fetching';
        state.bFetchDoneAt = view.now + FETCH_SECONDS;

        return;
    }

    if (op === 'swing') {
        if (state.bPhase !== 'holding' || view.aisleFloorItem) return;

        state.bPhase = 'swinging';
        state.swingStartAt = at;

        return;
    }

    if (op === 'toss' && state.bPhase === 'swinging') resolveToss(state, view, at, effects);
}

/**
 * B's restraint rule, in order: a body in the aisle wears the set, a full cradle
 * bounces it whatever the timing, and only then does the arc get judged.
 */
function resolveToss(
    state: JigState,
    view: JigTickView,
    at: number,
    effects: JigEffect[],
): void {
    const parts = view.bParts;

    state.bPhase = 'idle';

    if (parts === null) return;

    const litter = (note: JigNote): void => {
        effects.push({ e: 'partsToFloor', itemId: parts.itemId, tile: state.tiles.aisle });
        state.last = { who: 'b', step: 'toss', grade: 'miss', note, at };
    };

    if (view.bodyOnAisle !== '') {
        litter('body');
        effects.push({ e: 'bubble', sessionId: view.bodyOnAisle });

        return;
    }

    if (state.cradle !== 'empty') {
        const [jx, jy] = nearestJigTile(state);

        effects.push({ e: 'fx', kind: 'bonk', x: jx + 0.5, y: jy + 0.5 });
        litter('full');

        return;
    }

    const { toss } = state.cfg;
    const offset = (at - (state.swingStartAt + toss.arcSeconds)) * 1000;
    const grade = judge(offset, toss);

    if (grade === 'miss') {
        litter(offset < 0 ? 'early' : 'late');

        return;
    }

    state.cradle = grade === 'perfect' ? 'armed' : 'surface';
    state.cradleFuse = parts.fuseLength;
    state.surfaceReadyAt = grade === 'perfect' ? 0 : view.now + SURFACE_TAX_SECONDS;
    state.last = { who: 'b', step: 'toss', grade, note: '', at };
    effects.push({ e: 'destroyItem', itemId: parts.itemId });
}

function nearestJigTile(state: JigState): Tile {
    const rack = state.tiles.rack[0];
    const first = state.tiles.jig[0] ?? [0, 0];

    return rack === undefined ? first : nearestTile(rack, state.tiles.jig);
}

function onLeave(state: JigState, sessionId: string): JigEffect[] {
    const effects: JigEffect[] = [];

    if (sessionId === state.b && sessionId !== '') {
        state.b = '';
        state.bPhase = 'idle';
        state.bFetchDoneAt = 0;
        state.swingStartAt = 0;
    }

    if (sessionId === state.a && sessionId !== '') {
        bail(state, effects);
        state.a = '';
    }

    return effects;
}

/** What A leaves behind, by phase (docs/04's "walk away mid-phrase"). */
function bail(state: JigState, effects: JigEffect[]): void {
    if (state.phase === 'pour' && state.pour !== null) {
        effects.push({ e: 'spill', tile: state.aTile });

        if (state.kegItemId !== '') {
            effects.push({ e: 'destroyItem', itemId: state.kegItemId });
            state.kegItemId = '';
        }

        state.keg = null;
        state.pour = null;
        state.fill = 0;

        return;
    }

    if (state.phase === 'knots') {
        state.lanes = [];
        state.knotAt = [];
        state.knotGrades = [];
        state.knotIndex = 0;
        state.workFuse = '';
        state.phase = 'parts';

        return;
    }

    if (state.phase === 'crimp') {
        effects.push(
            {
                e: 'dropStick',
                item: stickFrom(state, true, false),
                origin: state.aTile,
                culpritId: state.a,
            },
            { e: 'abort' },
        );
        clearJig(state);
        state.phase = 'seat';
    }
}

/** `ctx.beginCycle()` said no: put the casing back on the shelf by never taking it. */
function onRefused(state: JigState): JigEffect[] {
    if (!state.pendingSeat) return [];

    state.pendingSeat = false;
    state.seated = null;
    state.pour = null;
    state.fill = 0;
    state.phase = 'seat';

    return [];
}
