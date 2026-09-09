import type { Grade } from '../report';
import type { ItemType, Line, Product, StationType } from '../schema/types';

/**
 * The level and layout config a designer edits (contracts §8). Every number the
 * sim reads lives here or in `defaults.ts`; `schema.json` is the same shape as
 * JSON Schema so Laravel can validate a level without running TypeScript.
 */

export type Tile = [number, number];
/** `[x, y, w, h]`. */
export type Rect = [number, number, number, number];
/** JSON object keys are strings, so a staffing curve is keyed `"1"`, `"2"`, … */
export type StaffingCurve = Record<string, number>;
export type EndsOn = 'either' | 'book' | 'clock' | 'never';
export type JoinMode = 'press' | 'stand';

export interface DayConfig {
    shiftSeconds: number;
    orderBook: number;
    endsOn: EndsOn;
    earlyFinishBonusPerMinute: number;
    earlyFinishCap: number;
}

export interface PlayersConfig {
    min: number;
    max: number;
}

export interface GrooveWeights {
    onTimeShip: number;
    shelfFullness: number;
    floorItem: number;
    rework: number;
    starved: number;
    jammed: number;
    litFuse: number;
    fizzle: number;
    niceSave: number;
    blastKeg: number;
    primeStick: number;
    truckComplete?: number;
}

export interface GrooveThresholds {
    onFire: number;
    groove: number;
    churn: number;
    meltdown: number;
}

export interface CleanSweepConfig {
    holdSeconds: number;
    snapTo: number;
    cooldownSeconds: number;
}

export interface GrooveConfig {
    start: number;
    weights: GrooveWeights;
    thresholds: GrooveThresholds;
    cleanSweep: CleanSweepConfig;
}

export interface InterruptsConfig {
    everySeconds: number;
    pauseSeconds: number;
}

export interface MovementConfig {
    tilesPerSecond: number;
    playerRadius: number;
    bumpStaggerSeconds: number;
    floorItemSpeed: number;
    spillSpeed: number;
}

export interface WindowFloorsMs {
    ok: number;
    perfect: number;
}

export interface DropConfig {
    kegKnockOverOnHit: boolean;
    stickFizzleChance: number;
    crateRattlyOnDrop: boolean;
}

export interface CarryConfig {
    slowdown: number;
    throwTiles: number;
    throwFlightSeconds: number;
    catchOkMs: number;
    catchPerfectMs: number;
    drop: DropConfig;
    truckRideSeconds: number;
    footprints: boolean;
    putDownSeconds?: number;
    hitStaggerSeconds?: number;
}

export interface InputShelfConfig {
    tile: Tile;
    capacity: number;
    accepts: ItemType[];
}

export interface OutputShelfConfig {
    tile: Tile;
    capacity: number;
}

export interface FloorRingConfig {
    tiles: Tile[];
}

export interface HeatConfig {
    minChargeSeconds: number;
    maxChargeSeconds: number;
    okMsAtMaxCharge: number;
    okMsAtMinCharge: number;
    deadCenterMs: number;
    churnBandDrift: number;
    overholdMs?: number;
}

export interface BoomPowderMinigame {
    heat: HeatConfig;
    comboTiers: number[];
    overflowSpills: boolean;
    comboBannerSeconds?: number;
}

export interface PourConfig {
    /** Keyed by keg quality as written in JSON: `"1.0"`, `"0.7"`, `"0.4"`. */
    beatsByQuality: Record<string, number>;
    perfectMs: number;
    okMs: number;
    primeKegWindowMultiplier: number;
}

export interface KnotsConfig {
    long: number;
    short: number;
    secondsPerKnot: number;
    perfectMs: number;
    okMs: number;
}

export interface CrimpConfig {
    clicks: number;
    clickSeconds: number;
    perfectMs: number;
    okMs: number;
}

export interface TossConfig {
    arcSeconds: number;
    perfectMs: number;
    okMs: number;
}

export interface CasingsConfig {
    stock: number;
    dentChance: number;
}

export interface AssemblyMinigame {
    pour: PourConfig;
    knots: KnotsConfig;
    crimp: CrimpConfig;
    toss: TossConfig;
    casings?: CasingsConfig;
}

export interface DockMinigame {
    beepHz: number;
    perfectMs: number;
    okMs: number;
    tailgateWindowSeconds: number;
    tailgateHoldSeconds?: number;
    leaveSeconds?: number;
}

/** Discriminated by the owning station's `type`, not by a key of its own. */
export type MinigameConfig = BoomPowderMinigame | AssemblyMinigame | DockMinigame;

export interface StationConfig {
    id: string;
    type: StationType;
    line: Line;
    joinMode: JoinMode;
    anchor: Tile;
    workTiles: Tile[];
    rackTiles: Tile[];
    inputShelf?: InputShelfConfig | null;
    outputShelf?: OutputShelfConfig | null;
    floorRing: FloorRingConfig;
    nominalSeconds: number;
    floorSeconds: number;
    staffing: StaffingCurve;
    churnSensitive: boolean;
    minigame: MinigameConfig;
}

export interface RecipeOutput {
    type: ItemType;
    product?: Product;
    pours?: number;
}

export interface RecipeConfig {
    station: StationType;
    inputs: Record<string, number>;
    output: RecipeOutput;
    cycleMultiplier?: number;
}

export interface OrderMixEntry {
    type: string;
    weight: number;
}

export interface QtyPerTruckConfig {
    base: number;
    rampPerMinute: number;
}

export interface OrdersConfig {
    firstAt: number;
    everySeconds: number;
    truckWaitSeconds: number;
    mix: OrderMixEntry[];
    qtyPerTruck: QtyPerTruckConfig;
}

export interface SparkChances {
    slammerRedline: number;
    jammedPer10s: number;
    crimpOnDented: number;
}

export interface FuelWeights {
    floorKeg: number;
    spillTile: number;
    shelfKeg: number;
}

export interface HazardsConfig {
    fuseSeconds: number;
    chainFuseSeconds: number;
    blastRadius: number;
    chainWindowSeconds: number;
    sparks: SparkChances;
    fuel: FuelWeights;
    incidentThreshold: number;
    factoryExplosionThreshold: number;
    explosionEndsRound: boolean;
    dangerWarningAt: number;
    stompSeconds: number;
    stunSeconds: number;
    knockbackTiles: number;
    litKegCarry: boolean;
    unjamSeconds?: number;
    sweepSecondsPerTile?: number;
    repairSeconds?: number;
    bannerSeconds?: number;
}

export interface GradeWeights {
    onTime: number;
    wip: number;
    quality: number;
    cycle: number;
    incident: number;
    heroCap: number;
}

export interface GradeThresholds {
    A: number;
    B: number;
    C: number;
    D: number;
}

export interface GradeTargets {
    wip: number;
    cycleSeconds: number;
}

/** `onTime` lower bounds; below `rough` is DISASTER. */
export interface VerdictThresholds {
    flow: number;
    smooth: number;
    fine: number;
    rough: number;
}

export interface GradingConfig {
    weights: GradeWeights;
    thresholds: GradeThresholds;
    targets: GradeTargets;
    multiplier: Record<Grade, number>;
    verdict: VerdictThresholds;
    advanceOn?: Exclude<Grade, 'F'>;
}

export interface ScoringConfig {
    perOrder: number;
}

export interface EconomyConfig {
    price: Record<Product, number>;
    /** A type with no entry costs nothing to waste. */
    wasteCost: Partial<Record<ItemType, number>>;
}

export interface ScalingBreakpoint {
    maxPlayers: number;
    lines: 1 | 2;
    truckEverySeconds: number;
    orderBook: number;
    layout?: string;
    /**
     * Small crews need smaller trucks, not just fewer of them. Omitted breakpoints keep the
     * level's own `orders.qtyPerTruck`.
     */
    qtyPerTruck?: { base: number; rampPerMinute: number };
}

export interface ScalingConfig {
    breakpoints: ScalingBreakpoint[];
}

/** Joke text must stay editable without a schema change, so extra keys are allowed. */
export interface LevelCopyConfig {
    clipboard: string[];
    [key: string]: unknown;
}

export interface LevelConfig {
    key: string;
    name: string;
    notes?: string;
    day: DayConfig;
    players: PlayersConfig;
    layout: string;
    groove: GrooveConfig;
    clipboardSeconds: number;
    clipboardMemorySeconds?: number;
    interrupts?: InterruptsConfig;
    movement?: MovementConfig;
    bpm: number;
    windowFloorsMs: WindowFloorsMs;
    carry: CarryConfig;
    stations: StationConfig[];
    recipes: Record<string, RecipeConfig>;
    orders: OrdersConfig;
    hazards: HazardsConfig;
    grading: GradingConfig;
    scoring?: ScoringConfig;
    economy: EconomyConfig;
    scaling: ScalingConfig;
    copy?: LevelCopyConfig;
}

export interface LayoutProps {
    toolCart: Tile;
    countdownSign: Tile;
    returnsPile: Tile;
    broomHook: Tile;
}

export interface LayoutConfig {
    key: string;
    width: number;
    height: number;
    /** The complete impassable set, packed `y * width + x`. */
    walls: number[];
    spawn: Tile;
    breakRoom: Rect;
    blastBins: Tile[];
    /** `[x, y, w]`. */
    dockDoor: [number, number, number];
    truckBay: Rect;
    ramp: Tile[];
    beaconPoles: Record<string, Tile>;
    orderBoard: Tile;
    props: LayoutProps;
}
