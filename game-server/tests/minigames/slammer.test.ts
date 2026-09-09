import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    KEG_QUALITY,
    bandDrift,
    boundedMs,
    chargeSeconds,
    comboTier,
    decodeMg,
    encodeMg,
    gaugeTopMs,
    heatOf,
    idleMg,
    judgeRelease,
    kegFor,
    okWindowMs,
    scaleLevel,
    targetMs,
} from '../../src/shared';
import type {
    BoomPowderMinigame,
    MgOp,
    PlayerState,
    ScaledLevel,
    SlammerHeatConfig,
    SlammerMg,
    StationState,
} from '../../src/shared';
import { createItem, giveToPlayer, shelfPush, takeCarried } from '../../src/sim/items';
import { setSparkHook, slammerModule } from '../../src/sim/minigames/slammer';
import { leave, onInteract, onMg, pauseStation, tick as stationsTick } from '../../src/sim/stations';
import type { Station } from '../../src/sim/stations';
import type { World } from '../../src/sim/World';
import { makeWorld } from '../helpers/world';

/**
 * The Slammer (F07, docs/04 "The Slammer"). Heat is a greed ceiling, so almost
 * every assertion here is about a number the player chose: how fast they mashed
 * decides how small their own window is, and a late release is the only thing
 * on this station that makes fuel *and* lights it.
 */

const HEAT: SlammerHeatConfig = {
    minChargeSeconds: 0.7,
    maxChargeSeconds: 1.5,
    okMsAtMaxCharge: 225,
    okMsAtMinCharge: 105,
    deadCenterMs: 50,
    churnBandDrift: 0.08,
    overholdMs: 500,
};

describe('heat maths', () => {
    it('doubles the mash span into the charge time', () => {
        expect(chargeSeconds(0.5, HEAT)).toBeCloseTo(1.0, 10);
    });

    it('clamps a hot mash to minChargeSeconds and a lazy mash to maxChargeSeconds', () => {
        expect(chargeSeconds(0.2, HEAT)).toBe(0.7);
        expect(chargeSeconds(1.4, HEAT)).toBe(1.5);
    });

    it('clamps exactly at the 0.35 s and 0.75 s boundaries', () => {
        expect(chargeSeconds(0.35, HEAT)).toBeCloseTo(0.7, 10);
        expect(chargeSeconds(0.75, HEAT)).toBeCloseTo(1.5, 10);
    });

    it('is okMsAtMinCharge at the hot climb and okMsAtMaxCharge at the lazy one', () => {
        expect(okWindowMs(0.7, HEAT)).toBeCloseTo(105, 10);
        expect(okWindowMs(1.5, HEAT)).toBeCloseTo(225, 10);
    });

    it('interpolates the OK window linearly between the two climbs', () => {
        expect(okWindowMs(1.1, HEAT)).toBeCloseTo(165, 10);
        expect(okWindowMs(1.0, HEAT)).toBeCloseTo(150, 10);
    });

    it('never produces an OK window under the 100 ms floor with the shipped numbers', () => {
        for (let t = HEAT.minChargeSeconds; t <= HEAT.maxChargeSeconds; t += 0.01) {
            expect(okWindowMs(t, HEAT)).toBeGreaterThanOrEqual(100);
        }
    });

    it('maps heat 1 to the hot climb and heat 0 to the lazy one', () => {
        expect(heatOf(0.7, HEAT)).toBeCloseTo(1, 10);
        expect(heatOf(1.5, HEAT)).toBeCloseTo(0, 10);
        expect(heatOf(1.1, HEAT)).toBeCloseTo(0.5, 10);
    });

    it('applies the band drift to the target time', () => {
        expect(targetMs(1.0, 0)).toBeCloseTo(1000, 10);
        expect(targetMs(1.0, 0.08)).toBeCloseTo(1080, 10);
        expect(targetMs(1.0, -0.08)).toBeCloseTo(920, 10);
    });

    it('draws the gauge top at 2345 ms for the shipped numbers', () => {
        expect(gaugeTopMs(HEAT)).toBeCloseTo(2345, 10);
    });
});

describe('judgement', () => {
    it('judges DEAD CENTER within deadCenterMs inclusive', () => {
        expect(judgeRelease(0, 150, 50)).toBe('dead_center');
        expect(judgeRelease(50, 150, 50)).toBe('dead_center');
        expect(judgeRelease(-50, 150, 50)).toBe('dead_center');
    });

    it('judges PRIME inside the band and outside dead center', () => {
        expect(judgeRelease(51, 150, 50)).toBe('prime');
        expect(judgeRelease(150, 150, 50)).toBe('prime');
        expect(judgeRelease(-150, 150, 50)).toBe('prime');
    });

    it('judges late past the band and early before it', () => {
        expect(judgeRelease(151, 150, 50)).toBe('late');
        expect(judgeRelease(-151, 150, 50)).toBe('early');
    });

    it('maps outcomes to keg quality and prime', () => {
        expect(kegFor('dead_center')).toEqual({ quality: KEG_QUALITY.prime, prime: true });
        expect(kegFor('prime')).toEqual({ quality: 1.0, prime: false });
        expect(kegFor('late')).toEqual({ quality: KEG_QUALITY.damp, prime: false });
        expect(kegFor('early')).toEqual({ quality: KEG_QUALITY.dud, prime: false });
    });
});

describe('churn drift and combo tiers', () => {
    it('rolls zero drift above the churn threshold', () => {
        expect(bandDrift(31, 30, 0.08, 0)).toBe(0);
        expect(bandDrift(100, 30, 0.08, 0.9)).toBe(0);
    });

    it('rolls drift within the drift magnitude at or below the threshold', () => {
        expect(bandDrift(30, 30, 0.08, 0)).toBeCloseTo(-0.08, 10);
        expect(bandDrift(30, 30, 0.08, 0.5)).toBeCloseTo(0, 10);
        expect(bandDrift(10, 30, 0.08, 1)).toBeCloseTo(0.08, 10);
    });

    it('counts combo tiers at 10, 25 and 50', () => {
        const tiers = [10, 25, 50];

        expect(comboTier(9, tiers)).toBe(0);
        expect(comboTier(10, tiers)).toBe(1);
        expect(comboTier(24, tiers)).toBe(1);
        expect(comboTier(25, tiers)).toBe(2);
        expect(comboTier(49, tiers)).toBe(2);
        expect(comboTier(50, tiers)).toBe(3);
    });
});

describe('the lag-bounded interval', () => {
    it('trusts a client interval within the tolerance', () => {
        expect(boundedMs(500, 480, 100)).toBe(500);
    });

    it('clamps a client interval to the server interval plus or minus the tolerance', () => {
        expect(boundedMs(5000, 480, 100)).toBe(580);
        expect(boundedMs(0, 480, 100)).toBe(380);
    });

    it('falls back to the server interval for a non-finite or negative client interval', () => {
        expect(boundedMs(Number.NaN, 480, 100)).toBe(480);
        expect(boundedMs(Number.POSITIVE_INFINITY, 480, 100)).toBe(480);
        expect(boundedMs(-1, 480, 100)).toBe(480);
    });
});

describe('the mg wire form', () => {
    it('round-trips SlammerMg through encode and decode', () => {
        const mg = idleMg(HEAT, 0.04);

        mg.phase = 'charge';
        mg.mashed = ['l', 'u', 'r'];
        mg.chargeStartAt = 12.5;
        mg.tCharge = 1;
        mg.okMs = 150;
        mg.heat = 0.625;
        mg.combo = 26;
        mg.tier = 2;
        mg.lastOutcome = 'late';
        mg.lastErrorMs = -12;

        expect(decodeMg(encodeMg(mg))).toEqual(mg);
    });

    it('starts idle with the config the overlay predicts from', () => {
        const mg = idleMg(HEAT, 0.04);

        expect(mg.phase).toBe('idle');
        expect(mg.mashed).toEqual([]);
        expect(mg.combo).toBe(0);
        expect(mg.bandOffset).toBeCloseTo(0.04, 10);
        expect(mg.cfg).toEqual(HEAT);
    });

    it('decodes a malformed mg string to null', () => {
        expect(decodeMg('')).toBeNull();
        expect(decodeMg('not json')).toBeNull();
        expect(decodeMg('[]')).toBeNull();
        expect(decodeMg('{"phase":"boiling"}')).toBeNull();
        expect(decodeMg(encodeMg(idleMg(HEAT, 0)).replace('"mashed":[]', '"mashed":["z"]'))).toBeNull();
    });
});

/** Server module: a real world, a real station, driven only through F05's verbs. */

const HOPPER: [number, number] = [4.5, 2.5];
const WORK_TILE: [number, number] = [5, 4];

interface SparkCall {
    stationId: string;
    cause: string;
}

let world: World;
let player: PlayerState;
let sparks: SparkCall[];
let clientT: number;

function stationOf(w: World): Station {
    const station = w.stations.get('powder-a');

    if (station === undefined) throw new Error('no powder-a');

    return station;
}

function stateOf(w: World): StationState {
    return stationOf(w).st;
}

function mgOf(w: World): SlammerMg {
    const decoded = decodeMg(stateOf(w).mg);

    if (decoded === null) throw new Error(`mg is not a SlammerMg: ${stateOf(w).mg}`);

    return decoded;
}

function send(op: MgOp, t: number, v?: string): void {
    onMg(world, player, { stationId: 'powder-a', op, t, v });
}

/** One whole rep: three chutes over `spanMs`, then a hold of `heldMs`. */
function slam(heldMs: number, spanMs = 500): void {
    const first = clientT + 1000;

    send('mash', first, 'l');
    send('mash', first + spanMs / 2, 'u');
    world.state.clock += spanMs / 1000;
    send('mash', first + spanMs, 'r');
    send('charge', first + spanMs);
    world.state.clock += heldMs / 1000;
    clientT = first + spanMs + heldMs;
    send('release', clientT);
}

/** Clean reps back to back, the shelf emptied between them as the Jig would. */
function chain(count: number): void {
    for (let i = 0; i < count; i++) {
        world.state.clock += 3;
        slam(1000);
        stateOf(world).outputShelf.clear();
    }
}

function fxOf(kind: string): { x: number; y: number; size?: number }[] {
    return world.outbox
        .filter((out) => out.name === 'fx' && out.payload.kind === kind)
        .map((out) => out.payload as { x: number; y: number; size?: number });
}

function kegs(): { quality: number; prime: boolean }[] {
    const made: { quality: number; prime: boolean }[] = [];

    world.state.items.forEach((item) => {
        if (item.type === 'keg') made.push({ quality: item.quality, prime: item.prime });
    });

    return made;
}

beforeEach(() => {
    sparks = [];
    clientT = 0;
    setSparkHook((_w, stationId, cause) => {
        sparks.push({ stationId, cause });
    });

    world = makeWorld({ players: 1 });
    world.startDay(scaleLevel(world.level, 3) as ScaledLevel);

    const seated = world.state.players.get('session-0');

    if (seated === undefined) throw new Error('no session-0');

    player = seated;
    player.x = WORK_TILE[0] + 0.5;
    player.y = WORK_TILE[1] + 0.5;
    world.reindexPlayers();
    onInteract(world, player);
    player.clipboardUntil = 0;
    player.bubble = '';
    player.bubbleUntil = 0;

    // One staffing pass, so `efficiency` is the curve's 1.0 rather than the
    // schema default: a zero-efficiency machine never re-arms at all.
    stationsTick(world, 0);
    world.outbox.length = 0;
});

afterEach(() => {
    setSparkHook(null);
});

describe('mashing the chutes', () => {
    it('enters mash on the first chute and lights that chute', () => {
        send('mash', 1000, 'l');

        expect(mgOf(world).phase).toBe('mash');
        expect(mgOf(world).mashed).toEqual(['l']);
        expect(stationOf(world).cycle).not.toBeNull();
    });

    it('refuses the first mash while the machine is re-arming', () => {
        // A hot 0.3 s mash plus a 0.7 s climb is a 1.0 s rep against a 1.05 s
        // machine floor: the player is now waiting for the plunger.
        slam(700, 300);
        send('mash', clientT + 100, 'l');

        expect(mgOf(world).phase).toBe('idle');
        expect(mgOf(world).mashed).toEqual([]);
    });

    it('ignores a mash from a player who is not the operator', () => {
        const other = world.addPlayer('session-9', { userId: 'u9', name: 'Nine', factoryId: '7' });

        other.stationId = 'powder-a';
        onMg(world, other, { stationId: 'powder-a', op: 'mash', t: 1000, v: 'l' });

        expect(mgOf(world).phase).toBe('idle');
    });

    it('spills at the operator tile and emits slop on a fourth press', () => {
        send('mash', 1000, 'l');
        send('mash', 1100, 'u');
        send('mash', 1200, 'r');
        send('mash', 1300, 'l');

        expect(fxOf('slop')).toEqual([{ kind: 'slop', x: HOPPER[0], y: HOPPER[1] }]);
        expect(world.state.spillTiles).toContain(world.packTile(WORK_TILE[0], WORK_TILE[1]));
        expect(mgOf(world).mashed).toEqual(['l', 'u', 'r']);
    });

    it('spills on a repeated chute without clearing the mash', () => {
        send('mash', 1000, 'l');
        send('mash', 1100, 'l');

        expect(mgOf(world).mashed).toEqual(['l']);
        expect(world.state.spillTiles).toContain(world.packTile(WORK_TILE[0], WORK_TILE[1]));
    });

    it('emits slop but does not spill when overflowSpills is false', () => {
        const powder = stationOf(world).cfg.minigame as BoomPowderMinigame;

        powder.overflowSpills = false;

        send('mash', 1000, 'l');
        send('mash', 1100, 'l');

        expect(fxOf('slop')).toHaveLength(1);
        expect([...world.state.spillTiles]).toEqual([]);
    });

    it('keeps the combo through an overflow', () => {
        chain(1);
        world.state.clock += 3;

        expect(mgOf(world).combo).toBe(1);

        send('mash', clientT + 1000, 'l');
        send('mash', clientT + 1100, 'l');

        expect(mgOf(world).combo).toBe(1);
        expect(player.combo).toBe(1);
    });

    it('writes StationState.mg only when the public state changes', () => {
        send('mash', 1000, 'l');

        const before = stateOf(world).mg;

        send('mash', 1100, 'l');

        expect(stateOf(world).mg).toBe(before);
    });
});

describe('charging', () => {
    it('ignores charge before three chutes', () => {
        send('mash', 1000, 'l');
        send('mash', 1100, 'u');
        send('charge', 1200);

        expect(mgOf(world).phase).toBe('mash');
        expect(mgOf(world).tCharge).toBe(0);
    });

    it('starts the charge with tCharge, okMs and heat from the mash span', () => {
        send('mash', 1000, 'l');
        send('mash', 1150, 'u');
        world.state.clock += 0.3;
        send('mash', 1300, 'r');
        send('charge', 1300);

        const mg = mgOf(world);

        expect(mg.phase).toBe('charge');
        expect(mg.tCharge).toBeCloseTo(0.7, 10);
        expect(mg.okMs).toBe(105);
        expect(mg.heat).toBeCloseTo(1, 10);
        expect(mg.chargeStartAt).toBeCloseTo(world.state.clock, 10);
    });

    it('clamps a lying client mash span to the server span plus the tolerance', () => {
        send('mash', 1000, 'l');
        send('mash', 3000, 'u');
        world.state.clock += 0.5;
        send('mash', 6000, 'r');
        send('charge', 6000);

        // The server saw 500 ms; the tolerance buys the client 100 ms more.
        expect(mgOf(world).tCharge).toBeCloseTo(1.2, 10);
        expect(mgOf(world).okMs).toBe(180);
    });
});

describe('releasing', () => {
    it('shelves a prime keg, combo +1 and thunk size 2 on DEAD CENTER', () => {
        slam(1000);

        expect(kegs()).toEqual([{ quality: 1.0, prime: true }]);
        expect(mgOf(world).combo).toBe(1);
        expect(mgOf(world).lastOutcome).toBe('dead_center');
        expect(fxOf('thunk')).toEqual([{ kind: 'thunk', x: HOPPER[0], y: HOPPER[1], size: 2 }]);
        expect(stateOf(world).outputShelf).toHaveLength(1);
    });

    it('shelves a 1.0 keg, combo +1 and thunk size 1 in the band', () => {
        slam(1100);

        expect(kegs()).toEqual([{ quality: 1.0, prime: false }]);
        expect(mgOf(world).combo).toBe(1);
        expect(mgOf(world).lastErrorMs).toBe(100);
        expect(fxOf('thunk')).toEqual([{ kind: 'thunk', x: HOPPER[0], y: HOPPER[1], size: 1 }]);
    });

    it('shelves a 0.7 keg, resets the combo and sparks the ring when late', () => {
        chain(2);
        world.state.clock += 3;
        world.outbox.length = 0;
        slam(1400);

        expect(kegs().at(-1)).toEqual({ quality: 0.7, prime: false });
        expect(mgOf(world).combo).toBe(0);
        expect(player.combo).toBe(0);
        expect(fxOf('pfft')).toHaveLength(1);
        expect(sparks).toEqual([{ stationId: 'powder-a', cause: 'slammerRedline' }]);
    });

    it('does not spark when the roll is at or above slammerRedline', () => {
        world.level.hazards.sparks.slammerRedline = 0;
        slam(1400);

        expect(mgOf(world).lastOutcome).toBe('late');
        expect(sparks).toEqual([]);
    });

    it('shelves a 0.4 keg, resets the combo and never sparks when early', () => {
        slam(600);

        expect(kegs()).toEqual([{ quality: 0.4, prime: false }]);
        expect(mgOf(world).combo).toBe(0);
        expect(mgOf(world).lastErrorMs).toBe(-400);
        expect(fxOf('clink').some((m) => m.x === HOPPER[0] && m.y === HOPPER[1])).toBe(true);
        expect(sparks).toEqual([]);
    });

    it('completes the cycle with perfect only on DEAD CENTER', () => {
        slam(1000);

        expect(stationOf(world).lastCycleWasPerfect).toBe(true);

        world.state.clock += 3;
        stateOf(world).outputShelf.clear();
        slam(1100);

        expect(stationOf(world).lastCycleWasPerfect).toBe(false);
    });

    it('ignores a second release after the first', () => {
        slam(1000);
        send('release', clientT + 50);

        expect(kegs()).toHaveLength(1);
        expect(mgOf(world).combo).toBe(1);
    });
});

describe('hands', () => {
    function fillShelf(): void {
        for (let i = 0; i < 6; i++) shelfPush(world, stateOf(world), 'out', createItem(world, 'keg'));
    }

    it('enters hands when the output shelf is full and returns to idle when carrying clears', () => {
        fillShelf();
        slam(1000);

        expect(mgOf(world).phase).toBe('hands');
        expect(player.carrying).not.toBe('');
        expect(mgOf(world).combo).toBe(1);

        takeCarried(world, 'session-0');
        stationsTick(world, 0.05);

        expect(mgOf(world).phase).toBe('idle');
        expect(mgOf(world).combo).toBe(1);
    });

    it('refuses mash in hands', () => {
        fillShelf();
        slam(1000);
        send('mash', clientT + 100, 'l');

        expect(mgOf(world).phase).toBe('hands');
        expect(mgOf(world).mashed).toEqual([]);
    });

    it('enters hands from idle when the operator is handed something', () => {
        giveToPlayer(world, createItem(world, 'keg'), 'session-0');
        stationsTick(world, 0.05);

        expect(mgOf(world).phase).toBe('hands');
    });

    it('forfeits a half-mashed cycle when the hands fill and re-arms once they are free', () => {
        send('mash', 1000, 'l');
        giveToPlayer(world, createItem(world, 'keg'), 'session-0');
        stationsTick(world, 0.05);

        expect(mgOf(world).phase).toBe('hands');
        expect(stationOf(world).cycle).toBeNull();

        takeCarried(world, 'session-0');
        stationsTick(world, 0.05);
        send('mash', 2000, 'l');

        expect(mgOf(world).phase).toBe('mash');
    });
});

describe('the overhold', () => {
    function startCharge(): void {
        send('mash', 1000, 'l');
        send('mash', 1150, 'u');
        world.state.clock += 0.5;
        send('mash', 1500, 'r');
        send('charge', 1500);
    }

    it('auto-fires late overholdMs past the band', () => {
        startCharge();

        // band centre 1000 ms + okMs 150 + overhold 500 = 1650 ms of held time.
        for (let i = 0; i < 32; i++) stationsTick(world, 0.05);

        expect(mgOf(world).phase).toBe('charge');

        for (let i = 0; i < 2; i++) stationsTick(world, 0.05);

        expect(mgOf(world).phase).toBe('idle');
        expect(mgOf(world).lastOutcome).toBe('late');
        expect(kegs()).toEqual([{ quality: 0.7, prime: false }]);
        expect(sparks).toHaveLength(1);
    });

    it('does not advance the overhold accumulator while the station is paused', () => {
        startCharge();
        pauseStation(world, 'powder-a', 60);

        for (let i = 0; i < 60; i++) stationsTick(world, 0.05);

        expect(mgOf(world).phase).toBe('charge');
        expect(kegs()).toEqual([]);
    });
});

describe('an interrupt mid-charge', () => {
    /** F05's own cadence: tick on the clock the station is standing on, then move it. */
    function run(to: number): void {
        while (world.state.clock < to - 1e-9) {
            stationsTick(world, 0.05);
            world.state.clock = Math.round((world.state.clock + 0.05) * 1000) / 1000;
        }
    }

    /** A 0.5 s mash at clock 4–4.5, so the climb is 1.0 s and the band centre 1000 ms. */
    function startCharge(): void {
        world.state.clock = 4;
        send('mash', 1000, 'l');
        send('mash', 1250, 'u');
        world.state.clock = 4.5;
        send('mash', 1500, 'r');
        send('charge', 1500);
    }

    it('holds the plunger where it stands, so the hairline is still the hairline', () => {
        startCharge();

        expect(mgOf(world).tCharge).toBeCloseTo(1, 10);

        pauseStation(world, 'powder-a', 0.5);
        run(5);

        // Ten paused ticks carry the anchor along with the clock, so the gauge
        // the overlay draws from waits out the distraction rather than climbing
        // through half a second the player is not allowed to release in.
        expect(mgOf(world).chargeStartAt).toBeCloseTo(5, 10);
        expect(mgOf(world).phase).toBe('charge');

        run(6);
        send('release', 3000);

        expect(mgOf(world).lastErrorMs).toBe(0);
        expect(mgOf(world).lastOutcome).toBe('dead_center');
        expect(kegs()).toEqual([{ quality: 1.0, prime: true }]);
    });
});

describe('combo tiers', () => {
    it('lights the beacon gold at tier 2 and clears it on a miss', () => {
        chain(25);
        stationsTick(world, 0.05);

        expect(mgOf(world).combo).toBe(25);
        expect(mgOf(world).tier).toBe(2);
        expect(stateOf(world).beacon).toBe('gold');

        world.state.clock += 3;
        slam(1400);
        stationsTick(world, 0.05);

        expect(mgOf(world).tier).toBe(0);
        expect(stateOf(world).beacon).toBe('off');
    });

    it('never overwrites a red beacon', () => {
        chain(25);
        stateOf(world).beacon = 'red';
        stationsTick(world, 0.05);

        expect(stateOf(world).beacon).toBe('red');
    });

    it('sets the HOT STREAK banner once when crossing 25', () => {
        chain(24);

        expect(world.state.banner).toBe('');

        world.state.clock += 3;
        slam(1000);

        expect(world.state.banner).toBe('HOT STREAK');
        expect(world.state.bannerUntil).toBeCloseTo(world.state.clock + 2, 10);

        world.state.banner = '';
        stateOf(world).outputShelf.clear();
        world.state.clock += 3;
        slam(1000);

        expect(world.state.banner).toBe('');
    });

    it('reaches tier 1 at 10 and tier 3 at 50', () => {
        chain(10);

        expect(mgOf(world).tier).toBe(1);

        chain(40);

        expect(mgOf(world).combo).toBe(50);
        expect(mgOf(world).tier).toBe(3);
    });

    it('mirrors the combo to PlayerState.combo', () => {
        chain(3);

        expect(player.combo).toBe(3);
    });
});

describe('the churn band', () => {
    it('leaves the band flat above the churn threshold', () => {
        expect(mgOf(world).bandOffset).toBe(0);

        chain(1);

        expect(mgOf(world).bandOffset).toBe(0);
    });

    it('re-rolls the band drift after each release in the churn', () => {
        world.state.groove = 20;
        leave(world, player, 'esc');
        onInteract(world, player);
        player.clipboardUntil = 0;

        const atJoin = mgOf(world).bandOffset;

        expect(Math.abs(atJoin)).toBeGreaterThan(0);
        expect(Math.abs(atJoin)).toBeLessThanOrEqual(0.08);

        world.state.clock += 3;
        slam(1000 * (1 + atJoin));

        const afterRelease = mgOf(world).bandOffset;

        expect(afterRelease).not.toBe(atJoin);
        expect(Math.abs(afterRelease)).toBeLessThanOrEqual(0.08);
    });
});

describe('leaving', () => {
    it.each(['esc', 'disconnect'] as const)(
        'aborts an unfinished cycle and resets everything on %s',
        (reason) => {
            chain(25);
            stationsTick(world, 0.05);
            world.state.clock += 3;
            send('mash', clientT + 1000, 'l');

            leave(world, player, reason);

            const mg = mgOf(world);

            expect(mg.phase).toBe('idle');
            expect(mg.combo).toBe(0);
            expect(mg.tier).toBe(0);
            expect(mg.heat).toBe(0);
            expect(mg.mashed).toEqual([]);
            expect(mg.lastOutcome).toBe('');
            expect(player.combo).toBe(0);
            expect(stationOf(world).cycle).toBeNull();
            expect(stateOf(world).beacon).toBe('off');
        },
    );

    it('leaves a red beacon alone on leave', () => {
        chain(25);
        stateOf(world).beacon = 'red';
        leave(world, player, 'esc');

        expect(stateOf(world).beacon).toBe('red');
    });
});

describe('the module surface', () => {
    it('never consumes E and is never starved', () => {
        const station = stationOf(world);
        const instance = slammerModule.create(station);

        expect(instance.onInteract({} as never, player)).toBe(false);
        expect(instance.starved({} as never)).toBe(false);
    });
});
