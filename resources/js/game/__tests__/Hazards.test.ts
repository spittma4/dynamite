import { TILE_PX } from '@shared';
import { describe, expect, it, vi } from 'vitest';

/**
 * Phaser touches `window` at import time, so the runtime is stubbed for the node
 * suite; the hazard layer reads it only for the two scene event names.
 */
vi.mock('phaser', () => ({
    default: { Scenes: { Events: { POST_UPDATE: 'postupdate', SHUTDOWN: 'shutdown' } } },
}));

import { PLAYER_PALETTE } from '../render/palette';
import {
    BLAST_RING_PX,
    BLAST_RING_START_PX,
    CONFETTI_COUNT,
    FLASH_COLOUR,
    IGNITION_COLOUR,
    SHAKE_MS,
    SHAKE_PER_SIZE,
    blastFx,
    blastShake,
    confettiSpray,
    fxSize,
    ignitionFx,
    installBlastFx,
    isFactoryExplosion,
    whumpFx,
} from '../hazards/BlastFx';
import {
    ALARM_BURST,
    BEACON_PEAK_AT,
    BEACON_PERIOD,
    DANGER_COLOURS,
    alarmPulsesLeft,
    anyRedBeacon,
    beaconCue,
    floorFuelTiles,
    hazardStripeTiles,
    pulseAlpha,
    pulseRadius,
} from '../hazards/DangerBeacon';
import type { FuseRow, FuseSource } from '../hazards/FuseFx';
import {
    FUSE_COLOURS,
    FUSE_HISS_HZ,
    FUSE_HISS_URGENT_HZ,
    FUSE_HZ,
    FUSE_URGENT_HZ,
    SPARKLE_MIN_ALPHA,
    CORD_PX,
    cordLength,
    fuseAnchor,
    fuseHz,
    hissPeriodSeconds,
    sparkleAlpha,
    sparkleTint,
    stompTiles,
    visibleHissPeriod,
} from '../hazards/FuseFx';
import { REPAIR_BAR_W, damagedStations, repairFill } from '../hazards/RepairSign';
import { createHazardsLayer } from '../hazards/HazardsLayer';
import type { Factory } from '../scenes/Factory';

/**
 * The client hazard layer (F10 §Client). The server owns every decision here —
 * what is burning, what is damaged and which beacon is red are all schema
 * fields — so what is tested is the reading: where a sparkle sits, how fast it
 * hisses, which tiles get stripes and what the blast does to the camera.
 */

describe('fuseAnchor', () => {
    it('puts a floor fuse at the centre of its own tile', () => {
        expect(fuseAnchor({ itemId: 'k-1', x: 3, y: 4 }, '')).toEqual({
            kind: 'tile',
            x: 3.5 * TILE_PX,
            y: 4.5 * TILE_PX,
        });
    });

    it('rides with the carrier when the burning keg is in somebody’s hands', () => {
        expect(fuseAnchor({ itemId: 'k-1', x: 3, y: 4 }, 's2')).toEqual({
            kind: 'carried',
            sessionId: 's2',
        });
    });

    it('hides a fuse the server has not placed on the floor yet', () => {
        expect(fuseAnchor({ itemId: 'k-1', x: -1, y: -1 }, '')).toEqual({ kind: 'hidden' });
    });
});

describe('fuseHz', () => {
    it('hisses twice as fast inside the last two seconds', () => {
        expect(fuseHz(6)).toBe(FUSE_HZ);
        expect(fuseHz(2.1)).toBe(FUSE_HZ);
        expect(fuseHz(1.9)).toBe(FUSE_URGENT_HZ);
        expect(fuseHz(0)).toBe(FUSE_URGENT_HZ);
    });
});

describe('hissPeriodSeconds', () => {
    it('keeps the sparkle’s own doubling at a rate an ear can count', () => {
        expect(hissPeriodSeconds(6)).toBeCloseTo(1 / FUSE_HISS_HZ, 9);
        expect(hissPeriodSeconds(1.9)).toBeCloseTo(1 / FUSE_HISS_URGENT_HZ, 9);
        expect(FUSE_HISS_URGENT_HZ / FUSE_HISS_HZ).toBe(FUSE_URGENT_HZ / FUSE_HZ);
    });

    it('pulses slowly enough to be heard as a rhythm rather than a tone', () => {
        expect(FUSE_HISS_URGENT_HZ).toBeLessThan(FUSE_HZ);
    });
});

describe('sparkleAlpha', () => {
    it('swings between the floor and full at the fuse’s own rate', () => {
        const quarter = 1000 / (4 * FUSE_HZ);

        expect(sparkleAlpha(6, quarter)).toBeCloseTo(1, 6);
        expect(sparkleAlpha(6, quarter * 3)).toBeCloseTo(SPARKLE_MIN_ALPHA, 6);
    });

    it('runs the urgent flicker on its own clock', () => {
        const quarter = 1000 / (4 * FUSE_URGENT_HZ);

        expect(sparkleAlpha(1, quarter)).toBeCloseTo(1, 6);
        expect(sparkleAlpha(1, quarter * 3)).toBeCloseTo(SPARKLE_MIN_ALPHA, 6);
    });
});

describe('sparkleTint', () => {
    it('goes from yellow to orange as the fuse runs out', () => {
        expect(sparkleTint(6, false)).toBe(FUSE_COLOURS.calm);
        expect(sparkleTint(1, false)).toBe(FUSE_COLOURS.urgent);
    });

    it('greys out under a boot, so the stomper can see it working', () => {
        expect(sparkleTint(6, true)).toBe(FUSE_COLOURS.stomped);
        expect(sparkleTint(1, true)).toBe(FUSE_COLOURS.stomped);
    });
});

describe('cordLength', () => {
    it('burns down with the fuse and never grows past the cord', () => {
        expect(cordLength(6, 6)).toBe(CORD_PX);
        expect(cordLength(3, 6)).toBe(CORD_PX / 2);
        expect(cordLength(9, 6)).toBe(CORD_PX);
        expect(cordLength(-1, 6)).toBe(0);
    });

    it('leaves a chain fuse a stub, which is what 1.5 s of warning looks like', () => {
        expect(cordLength(1.5, 6)).toBeCloseTo(CORD_PX / 4, 6);
    });

    it('survives a level with no fuse length to measure against', () => {
        expect(cordLength(1, 0)).toBe(CORD_PX);
    });
});

describe('stompTiles', () => {
    it('collects the tile of every player stamping on a fuse and nobody else', () => {
        const players = new Map([
            ['s1', { chore: 'stomp', x: 3.5, y: 4.5 }],
            ['s2', { chore: 'sweep', x: 8.5, y: 2.5 }],
            ['s3', { chore: '', x: 1.5, y: 1.5 }],
        ]);

        expect([...stompTiles(players)]).toEqual(['3,4']);
    });
});

describe('fxSize', () => {
    it('reads a missing size as the ordinary one-keg blast', () => {
        expect(fxSize(undefined)).toBe(1);
        expect(fxSize(3)).toBe(3);
    });
});

describe('isFactoryExplosion', () => {
    it('is the size the server reserves for the whole factory going up', () => {
        expect(isFactoryExplosion(1)).toBe(false);
        expect(isFactoryExplosion(3)).toBe(true);
    });
});

describe('blastShake', () => {
    it('shakes harder for a bigger blast, on the same 200 ms', () => {
        expect(blastShake(1)).toEqual({ duration: SHAKE_MS, intensity: SHAKE_PER_SIZE });
        expect(blastShake(3)).toEqual({ duration: SHAKE_MS, intensity: SHAKE_PER_SIZE * 3 });
    });
});

describe('confettiSpray', () => {
    it('throws the whole crew’s colours out of the bin', () => {
        const spray = confettiSpray(CONFETTI_COUNT);

        expect(spray).toHaveLength(CONFETTI_COUNT);
        expect(new Set(spray.map((bit) => bit.tint))).toEqual(new Set(PLAYER_PALETTE));
    });

    it('spreads them around the tile rather than piling them on the centre', () => {
        const spray = confettiSpray(CONFETTI_COUNT);
        const far = spray.filter((bit) => Math.hypot(bit.x, bit.y) > 4);

        expect(far.length).toBeGreaterThan(CONFETTI_COUNT / 2);
    });
});

describe('anyRedBeacon', () => {
    it('is true only while a station is calling the pile dangerous', () => {
        expect(anyRedBeacon(new Map([['powder-a', { beacon: 'off' }]]))).toBe(false);
        expect(anyRedBeacon(new Map([['powder-a', { beacon: 'gold' }]]))).toBe(false);
        expect(
            anyRedBeacon(
                new Map([
                    ['powder-a', { beacon: 'gold' }],
                    ['assembly-a', { beacon: 'red' }],
                ]),
            ),
        ).toBe(true);
    });
});

describe('floorFuelTiles', () => {
    it('counts floor kegs and spills, and nothing anybody is holding', () => {
        const items = new Map([
            ['k-1', { type: 'keg', x: 3, y: 4, holder: '', inFlight: false }],
            ['k-2', { type: 'keg', x: -1, y: -1, holder: 's1', inFlight: false }],
            ['k-3', { type: 'keg', x: 6, y: 4, holder: '', inFlight: true }],
            ['k-4', { type: 'keg', x: 9, y: 1, holder: 'powder-a', inFlight: false }],
            ['s-1', { type: 'stick', x: 5, y: 4, holder: '', inFlight: false }],
        ]);

        expect(floorFuelTiles(items, [4 * 10 + 5], 10)).toEqual([4 * 10 + 3, 4 * 10 + 5]);
    });

    it('names a tile once when a keg is standing in a spill', () => {
        const items = new Map([['k-1', { type: 'keg', x: 3, y: 4, holder: '', inFlight: false }]]);

        expect(floorFuelTiles(items, [4 * 10 + 3], 10)).toEqual([4 * 10 + 3]);
    });
});

describe('hazardStripeTiles', () => {
    it('rings the pile without striping the pile itself', () => {
        const open = (): boolean => false;
        const stripes = hazardStripeTiles([4 * 10 + 3], 10, open);

        expect(stripes).toHaveLength(8);
        expect(stripes).not.toContain(4 * 10 + 3);
        expect(stripes).toContain(3 * 10 + 2);
        expect(stripes).toContain(5 * 10 + 4);
    });

    it('leaves the walls and the edge of the map alone', () => {
        const isSolid = (tx: number, ty: number): boolean =>
            tx < 1 || ty < 1 || tx > 8 || ty > 8 || (tx === 2 && ty === 4);
        const stripes = hazardStripeTiles([4 * 10 + 1], 10, isSolid);

        expect(stripes).not.toContain(4 * 10 + 2);
        expect(stripes).not.toContain(4 * 10 + 0);
        expect(stripes).toContain(3 * 10 + 1);
    });

    it('stripes the border between two piles once', () => {
        const open = (): boolean => false;
        const stripes = hazardStripeTiles([4 * 10 + 3, 4 * 10 + 5], 10, open);

        expect(new Set(stripes).size).toBe(stripes.length);
        expect(stripes).not.toContain(4 * 10 + 3);
        expect(stripes).toContain(4 * 10 + 4);
    });
});

describe('pulseAlpha and pulseRadius', () => {
    it('breathes rather than blinks, so the pole and the lamp read apart', () => {
        const samples = [0, 0.1, 0.2, 0.3, 0.4].map((t) => pulseAlpha(t));

        expect(Math.min(...samples)).toBeGreaterThan(0);
        expect(Math.max(...samples)).toBeLessThanOrEqual(1);
        expect(new Set(samples).size).toBeGreaterThan(1);
    });

    it('grows the lamp with the same breath', () => {
        expect(pulseRadius(0)).toBeGreaterThan(0);
        expect(pulseRadius(0.25)).not.toBe(pulseRadius(0));
    });
});

describe('the beacon’s alarm beat', () => {
    it('falls on the lamp’s brightest moment, so the pulse and the sound are one event', () => {
        expect(pulseAlpha(BEACON_PEAK_AT)).toBeCloseTo(0.5, 6);
        expect(pulseAlpha(BEACON_PEAK_AT)).toBeGreaterThan(pulseAlpha(BEACON_PEAK_AT + 0.1));
        expect(pulseAlpha(BEACON_PEAK_AT)).toBeGreaterThan(pulseAlpha(BEACON_PEAK_AT - 0.1));
    });

    it('repeats on the lamp’s own period', () => {
        expect(pulseAlpha(BEACON_PEAK_AT + BEACON_PERIOD)).toBeCloseTo(
            pulseAlpha(BEACON_PEAK_AT),
            6,
        );
    });
});

/**
 * The hiss reports on the fuses that drew something, not on every row in
 * `state.fuses`. The fold used to run *above* the `hidden` guard, so a lit keg
 * that had gone off the map — into a truck, a hopper, or a bin — still set the
 * floor's hiss rate. That made the one cue whose whole meaning is its rate
 * double from 2 Hz to 4 Hz with nothing at all changing on screen: the sparkle
 * is drawn per fuse, and a hidden fuse has no sparkle.
 */
describe('visibleHissPeriod', () => {
    function fuses(...rows: FuseRow[]): FuseSource {
        return { forEach: (fn) => rows.forEach(fn) };
    }

    const onFloor = { itemId: 'k-1', x: 3, y: 4, secondsLeft: 5 };
    const offMap = { itemId: 'k-2', x: -1, y: -1, secondsLeft: 1 };

    it('hisses at the shortest fuse a player can see', () => {
        expect(visibleHissPeriod(fuses(onFloor), () => '')).toBeCloseTo(1 / FUSE_HISS_HZ, 9);
        expect(
            visibleHissPeriod(fuses(onFloor, { ...onFloor, itemId: 'k-3', secondsLeft: 1 }), () => ''),
        ).toBeCloseTo(1 / FUSE_HISS_URGENT_HZ, 9);
    });

    it('ignores a fuse that has gone off the map, which draws no sparkle', () => {
        expect(visibleHissPeriod(fuses(onFloor, offMap), () => '')).toBeCloseTo(
            1 / FUSE_HISS_HZ,
            9,
        );
    });

    it('keeps quiet when every fuse is hidden', () => {
        expect(visibleHissPeriod(fuses(offMap), () => '')).toBeNull();
        expect(visibleHissPeriod(fuses(), () => '')).toBeNull();
    });

    it('counts a carried fuse, which is drawn on the hands that hold it', () => {
        expect(visibleHissPeriod(fuses({ ...offMap, itemId: 'k-4' }), () => 'A1')).toBeCloseTo(
            1 / FUSE_HISS_URGENT_HZ,
            9,
        );
    });
});

/**
 * The alarm is an event, not a drone. `dangerBeacon` returns 'red' on a fuel
 * *level*, and level-02 is designed so the pile grows — so a metronome running
 * for as long as a pole is red ran for minutes, at more than twice the gain of
 * the lit-fuse `hiss` it is guaranteed to co-occur with, on a 1.5 Hz grid
 * incommensurate with the jig's 2.5 Hz. The lamp and the stripes are already
 * drawn and they carry the standing state on their own.
 */
describe('alarmPulsesLeft', () => {
    it('spends a burst on the crossing into red', () => {
        expect(alarmPulsesLeft(false, true, 0)).toBe(ALARM_BURST);
    });

    it('counts down rather than re-arming while the pole stays red', () => {
        expect(alarmPulsesLeft(true, true, 2)).toBe(2);
        expect(alarmPulsesLeft(true, true, 0)).toBe(0);
    });

    it('goes quiet the moment nothing is red, whatever it had left', () => {
        expect(alarmPulsesLeft(true, false, 3)).toBe(0);
    });

    it('is short enough to be news and not a noise floor', () => {
        expect(ALARM_BURST).toBeGreaterThan(0);
        expect(ALARM_BURST * BEACON_PERIOD).toBeLessThanOrEqual(3);
    });
});

describe('beaconCue', () => {
    it('warns once when a pole first goes gold', () => {
        expect(beaconCue('off', 'gold')).toBe('warn');
        expect(beaconCue('gold', 'gold')).toBeNull();
    });

    it('says nothing about red, which alarms on its own beat instead', () => {
        expect(beaconCue('gold', 'red')).toBeNull();
        expect(beaconCue('red', 'red')).toBeNull();
    });

    it('says nothing when a pole is going out', () => {
        expect(beaconCue('red', 'off')).toBeNull();
        expect(beaconCue('gold', 'off')).toBeNull();
    });
});

describe('damagedStations', () => {
    it('signs only the stations the server marked damaged, at their anchors', () => {
        const stations = new Map([
            ['powder-a', { id: 'powder-a', anchorX: 4, anchorY: 2, state: 'damaged', progress: 0.5 }],
            ['assembly-a', { id: 'assembly-a', anchorX: 12, anchorY: 6, state: 'idle', progress: 0 }],
        ]);

        expect(damagedStations(stations)).toEqual([
            { id: 'powder-a', x: 4.5 * TILE_PX, y: 2.5 * TILE_PX, progress: 0.5 },
        ]);
    });
});

describe('repairFill', () => {
    it('fills the bar with the progress the server wrote, clamped', () => {
        expect(repairFill(0)).toBe(0);
        expect(repairFill(0.5)).toBe(REPAIR_BAR_W / 2);
        expect(repairFill(1)).toBe(REPAIR_BAR_W);
        expect(repairFill(4)).toBe(REPAIR_BAR_W);
        expect(repairFill(-1)).toBe(0);
    });
});

/** A `Graphics`, `Text` and scene stand-in: everything the layer asks Phaser for. */
const GRAPHICS_OPS = [
    'fillStyle',
    'lineStyle',
    'fillRect',
    'strokeRect',
    'fillCircle',
    'strokeCircle',
    'fillRoundedRect',
    'lineBetween',
    'clear',
    'setPosition',
] as const;

class FakeText {
    text: string;
    visible = true;
    x = 0;
    y = 0;

    constructor(value: string) {
        this.text = value;
    }

    setOrigin(): this {
        return this;
    }

    setStroke(): this {
        return this;
    }

    setPosition(x: number, y: number): this {
        this.x = x;
        this.y = y;

        return this;
    }

    setText(value: string): this {
        this.text = value;

        return this;
    }

    setColor(): this {
        return this;
    }

    setVisible(value: boolean): this {
        this.visible = value;

        return this;
    }

    destroy(): void {}
}

interface Recorder {
    scene: Factory;
    ops: string[];
    texts: FakeText[];
    shakes: { duration: number; intensity: number }[];
    tweens: Record<string, unknown>[];
    handlers: Map<string, () => void>;
    overrides: Map<string, (scene: Factory, m: unknown) => void>;
    post: () => void;
}

interface World {
    fuses?: [string, Record<string, unknown>][];
    items?: [string, Record<string, unknown>][];
    players?: [string, Record<string, unknown>][];
    stations?: [string, Record<string, unknown>][];
    spillTiles?: number[];
}

const LAYOUT = {
    width: 20,
    height: 12,
    walls: [0],
    beaconPoles: { 'powder-a': [4, 5] as [number, number] },
};

function harness(world: World = {}): Recorder {
    const ops: string[] = [];
    const texts: FakeText[] = [];
    const shakes: { duration: number; intensity: number }[] = [];
    const tweens: Record<string, unknown>[] = [];
    const handlers = new Map<string, () => void>();
    const overrides = new Map<string, (scene: Factory, m: unknown) => void>();
    const graphics = (): unknown => {
        const g: Record<string, unknown> = {
            destroy: () => {},
            setVisible: () => g,
            setAlpha: () => g,
            setScale: () => g,
        };

        for (const op of GRAPHICS_OPS) {
            g[op] = (...args: unknown[]): unknown => {
                ops.push(`${op}:${args.map((a) => String(a)).join(',')}`);

                return g;
            };
        }

        return g;
    };
    const container = (): unknown => ({
        add: () => {},
        destroy: () => {},
        setPosition: () => {},
        setVisible: () => {},
    });
    const level = { hazards: { fuseSeconds: 6 } };
    const scene = {
        add: {
            graphics,
            text: (_x: number, _y: number, value: string) => {
                const label = new FakeText(value);

                texts.push(label);

                return label;
            },
            container,
        },
        cameras: {
            main: {
                shake: (duration: number, intensity: number) =>
                    shakes.push({ duration, intensity }),
            },
        },
        tweens: {
            add: (config: Record<string, unknown>) => {
                tweens.push(config);

                return config;
            },
        },
        events: {
            on: (name: string, fn: () => void) => handlers.set(name, fn),
            once: () => {},
            off: (name: string) => handlers.delete(name),
        },
        layers: {
            floor: { add: () => {} },
            fx: { add: () => {} },
            overlay: { add: () => {} },
        },
        fx: {
            override: (kind: string, handler: (scene: Factory, m: unknown) => void) =>
                overrides.set(kind, handler),
        },
        floorWidth: LAYOUT.width * TILE_PX,
        floorHeight: LAYOUT.height * TILE_PX,
        levelConfig: level,
        layout: LAYOUT,
        avatarPosition: (sessionId: string) =>
            sessionId === 's2' ? { x: 100, y: 200 } : null,
        conn: {
            sessionId: 's1',
            clock: { now: () => 10 },
            state: {
                fuses: new Map(world.fuses ?? []),
                items: new Map(world.items ?? []),
                players: new Map(world.players ?? []),
                stations: new Map(world.stations ?? []),
                spillTiles: world.spillTiles ?? [],
            },
            config: { level, layout: LAYOUT, copy: { chores: { repair: 'FILING INCIDENT REPORT' } } },
        },
    };

    return {
        scene: scene as unknown as Factory,
        ops,
        texts,
        shakes,
        tweens,
        handlers,
        overrides,
        post: () => handlers.get('postupdate')?.(),
    };
}

describe('installBlastFx', () => {
    it('takes over the four kinds F10 draws itself and leaves the rest to F04', () => {
        const h = harness();

        installBlastFx(h.scene);

        expect([...h.overrides.keys()].sort()).toEqual(['blast', 'fuse', 'spark', 'whump']);
    });
});

describe('blastFx', () => {
    it('throws a ring, a soot puff and a shake at the tile that went up', () => {
        const h = harness();

        blastFx(h.scene, { kind: 'blast', x: 3.5, y: 4.5, size: 1 });

        // The ring is drawn about its own origin and moved onto the tile, so the
        // tween that grows it expands from the blast rather than sliding away
        // from the canvas corner.
        expect(h.ops).toContain(`setPosition:${3.5 * TILE_PX},${4.5 * TILE_PX}`);
        expect(h.ops).toContain(`strokeCircle:0,0,${BLAST_RING_START_PX}`);
        expect(h.shakes).toEqual([{ duration: SHAKE_MS, intensity: SHAKE_PER_SIZE }]);
        expect(h.tweens.some((t) => t.scale === BLAST_RING_PX / BLAST_RING_START_PX)).toBe(true);
    });

    it('flashes the whole screen white only when the factory itself goes up', () => {
        const small = harness();

        blastFx(small.scene, { kind: 'blast', x: 3.5, y: 4.5, size: 1 });

        expect(small.ops.some((op) => op.startsWith(`fillStyle:${FLASH_COLOUR}`))).toBe(false);

        const big = harness();

        blastFx(big.scene, { kind: 'blast', x: 3.5, y: 4.5, size: 3 });

        expect(big.ops.some((op) => op.startsWith(`fillStyle:${FLASH_COLOUR}`))).toBe(true);
        expect(big.shakes).toEqual([{ duration: SHAKE_MS, intensity: SHAKE_PER_SIZE * 3 }]);
    });
});

describe('whumpFx', () => {
    it('puffs sand and throws confetti in the crew’s colours', () => {
        const h = harness();

        whumpFx(h.scene, { kind: 'whump', x: 3.5, y: 3.5 });

        for (const colour of PLAYER_PALETTE) {
            expect(h.ops.some((op) => op.startsWith(`fillStyle:${colour}`))).toBe(true);
        }

        expect(h.ops.filter((op) => op.startsWith('fillRect:')).length).toBe(CONFETTI_COUNT);
    });
});

describe('ignitionFx', () => {
    it('is a short yellow flash, and never shakes the camera for a spark', () => {
        const h = harness();

        ignitionFx(h.scene, { kind: 'spark', x: 1.5, y: 1.5 });

        expect(h.ops.some((op) => op.startsWith(`fillStyle:${IGNITION_COLOUR}`))).toBe(true);
        expect(h.shakes).toEqual([]);
    });
});

describe('createHazardsLayer', () => {
    it('sparkles on the tile of every fuse the server is burning', () => {
        const h = harness({
            fuses: [['k-1', { itemId: 'k-1', x: 3, y: 4, secondsLeft: 5, chain: false }]],
            items: [['k-1', { type: 'keg', x: 3, y: 4, holder: '', inFlight: false }]],
        });

        createHazardsLayer(h.scene);
        h.post();

        expect(h.ops.some((op) => op.startsWith(`fillStyle:${FUSE_COLOURS.calm}`))).toBe(true);
        expect(h.ops.some((op) => op.startsWith(`fillCircle:${3.5 * TILE_PX},`))).toBe(true);
    });

    it('follows the carrier of a lit keg instead of the tile it was lit on', () => {
        const h = harness({
            fuses: [['k-1', { itemId: 'k-1', x: 3, y: 4, secondsLeft: 5, chain: false }]],
            items: [['k-1', { type: 'keg', x: -1, y: -1, holder: 's2', inFlight: false }]],
            players: [['s2', { chore: '', x: 3.5, y: 4.5 }]],
        });

        createHazardsLayer(h.scene);
        h.post();

        expect(h.ops.some((op) => op.startsWith('fillCircle:100,'))).toBe(true);
    });

    it('greys the sparkle while somebody is standing on it', () => {
        const h = harness({
            fuses: [['t-83', { itemId: '', x: 3, y: 4, secondsLeft: 5, chain: false }]],
            players: [['s1', { chore: 'stomp', x: 3.5, y: 4.5 }]],
        });

        createHazardsLayer(h.scene);
        h.post();

        expect(h.ops.some((op) => op.startsWith(`fillStyle:${FUSE_COLOURS.stomped}`))).toBe(true);
    });

    it('stripes the pile only while a beacon is calling it dangerous', () => {
        const quiet = harness({
            items: [['k-1', { type: 'keg', x: 3, y: 4, holder: '', inFlight: false }]],
            stations: [['powder-a', { id: 'powder-a', anchorX: 4, anchorY: 2, beacon: 'off', state: 'idle', progress: 0 }]],
        });

        createHazardsLayer(quiet.scene);
        quiet.post();

        expect(quiet.ops.some((op) => op.startsWith(`lineStyle:2,${DANGER_COLOURS.stripe}`))).toBe(
            false,
        );

        const loud = harness({
            items: [['k-1', { type: 'keg', x: 3, y: 4, holder: '', inFlight: false }]],
            stations: [['powder-a', { id: 'powder-a', anchorX: 4, anchorY: 2, beacon: 'red', state: 'idle', progress: 0 }]],
        });

        createHazardsLayer(loud.scene);
        loud.post();

        expect(loud.ops.some((op) => op.startsWith(`lineStyle:2,${DANGER_COLOURS.stripe}`))).toBe(
            true,
        );
        expect(loud.ops.some((op) => op.startsWith(`fillCircle:${4.5 * TILE_PX},`))).toBe(true);
    });

    it('signs a damaged station with the report it is waiting on', () => {
        const h = harness({
            stations: [['powder-a', { id: 'powder-a', anchorX: 4, anchorY: 2, beacon: 'off', state: 'damaged', progress: 0.5 }]],
        });

        createHazardsLayer(h.scene);
        h.post();

        const sign = h.texts.find((t) => t.text === 'FILING INCIDENT REPORT');

        expect(sign?.visible).toBe(true);
        expect(h.ops.some((op) => op.startsWith(`fillRect:`) && op.includes(String(REPAIR_BAR_W / 2)))).toBe(
            true,
        );
    });

    it('hides the sign again once the report is filed', () => {
        const h = harness({
            stations: [['powder-a', { id: 'powder-a', anchorX: 4, anchorY: 2, beacon: 'off', state: 'damaged', progress: 0.5 }]],
        });

        createHazardsLayer(h.scene);
        h.post();

        const station = h.scene.conn.state.stations.get('powder-a') as unknown as {
            state: string;
        };

        station.state = 'idle';
        h.post();

        expect(h.texts.find((t) => t.text === 'FILING INCIDENT REPORT')?.visible).toBe(false);
    });

    it('draws nothing at all on a quiet floor', () => {
        const h = harness();

        createHazardsLayer(h.scene);
        h.post();

        expect(h.ops.filter((op) => !op.startsWith('clear'))).toEqual([]);
    });

    it('lets go of the frame loop when the scene tears down', () => {
        const h = harness();
        const layer = createHazardsLayer(h.scene);

        layer.destroy();

        expect(h.handlers.has('postupdate')).toBe(false);
    });
});
