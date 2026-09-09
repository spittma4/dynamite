import { LEVEL_DEFAULTS, applyGroove, cleanSweepStep, grooveDelta } from '../shared';
import type { CleanSweepState, GrooveEvents, GrooveSample } from '../shared';
import type { System, World } from './World';

/**
 * The Groove bar (contracts §10.7, docs/05). It is one scalar the whole factory
 * shares, so this is the only writer of `state.groove`: every other system says
 * what happened through `world.grooveEvents` and this tick decides what it was
 * worth.
 */

/** How far back an on-time ship rate looks — recent enough to feel like now. */
export const GROOVE_WINDOW_SECONDS = 60;

interface GrooveRuntime {
    cleanSweep: CleanSweepState;
    /** `clock` stamps, oldest first, trimmed to the window every tick. */
    completions: number[];
    departures: number[];
    settled: Set<string>;
    truckDocked: boolean;
    cleanSweeps: number;
}

const runtimes = new WeakMap<World, GrooveRuntime>();

function runtimeOf(world: World): GrooveRuntime {
    let runtime = runtimes.get(world);

    if (runtime === undefined) {
        runtime = {
            cleanSweep: { heldSince: null, lastFiredAt: null },
            completions: [],
            departures: [],
            settled: new Set(),
            truckDocked: false,
            cleanSweeps: 0,
        };
        runtimes.set(world, runtime);
    }

    return runtime;
}

/**
 * How many times the sweep fired this shift — `gradeInputsFor` spends them as
 * hero points, which is the only reason the count outlives the banner.
 */
export function cleanSweepCount(world: World): number {
    return runtimes.get(world)?.cleanSweeps ?? 0;
}

function trim(stamps: number[], clock: number): void {
    while (stamps.length > 0 && clock - (stamps[0] as number) > GROOVE_WINDOW_SECONDS) {
        stamps.shift();
    }
}

/** A truck that has stopped being docked has left, whether it is leaving or already away. */
function recordWindow(world: World, runtime: GrooveRuntime): void {
    const { state } = world;
    const clock = state.clock;

    state.orders.forEach((order, id) => {
        if (order.status !== 'complete' || runtime.settled.has(id)) return;

        runtime.settled.add(id);
        runtime.completions.push(clock);
    });

    const docked = state.truck.phase === 'docked';

    if (runtime.truckDocked && !docked) runtime.departures.push(clock);

    runtime.truckDocked = docked;

    trim(runtime.completions, clock);
    trim(runtime.departures, clock);
}

function sampleOf(world: World, runtime: GrooveRuntime): GrooveSample {
    const { state } = world;
    let floorItemCount = 0;
    let fullnessSum = 0;
    let shelves = 0;
    let starvedStationCount = 0;
    let jammedStationCount = 0;

    state.items.forEach((item) => {
        if (item.holder === '') floorItemCount++;
    });

    state.stations.forEach((station) => {
        if (station.inputCap > 0) {
            fullnessSum += station.inputShelf.length / station.inputCap;
            shelves++;
        }

        if (station.outputCap > 0) {
            fullnessSum += station.outputShelf.length / station.outputCap;
            shelves++;
        }

        if (station.state === 'starved') starvedStationCount++;
        if (station.state === 'jammed') jammedStationCount++;
    });

    return {
        onTimeShipRate:
            runtime.departures.length > 0
                ? runtime.completions.length / runtime.departures.length
                : 0,
        avgShelfFullness: shelves > 0 ? fullnessSum / shelves : 0,
        floorItemCount,
        reworkShelfCount: 0,
        starvedStationCount,
        jammedStationCount,
        litFuseCount: state.fuses.size,
    };
}

function drain(events: GrooveEvents): void {
    events.fizzles = 0;
    events.niceSaves = 0;
    events.blastKegs = 0;
    events.primeSticks = 0;
    events.trucksComplete = 0;
}

function bannerSeconds(world: World): number {
    return world.level.hazards.bannerSeconds ?? LEVEL_DEFAULTS.hazards.bannerSeconds;
}

function tick(world: World, dt: number): void {
    const runtime = runtimeOf(world);
    const { state } = world;
    const { weights, cleanSweep } = world.level.groove;

    recordWindow(world, runtime);

    const sample = sampleOf(world, runtime);

    state.groove = applyGroove(state.groove, grooveDelta(weights, sample, world.grooveEvents, dt));
    drain(world.grooveEvents);

    const step = cleanSweepStep(runtime.cleanSweep, sample, state.clock, cleanSweep);

    runtime.cleanSweep = step.state;

    if (!step.fire) return;

    runtime.cleanSweeps++;
    state.groove = Math.max(state.groove, cleanSweep.snapTo);

    // A hazard banner is news; a tidy floor can wait for the next sweep.
    if (state.clock < state.bannerUntil) return;

    state.banner = 'CLEAN SWEEP';
    state.bannerUntil = state.clock + bannerSeconds(world);
}

export const grooveSystem: System = { name: 'groove', tick };
