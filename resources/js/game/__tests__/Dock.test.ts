import type { DockLane, DockMg, Tile } from '@shared';
import { describe, expect, it } from 'vitest';

import {
    DOCK_LEGEND,
    bandHalfFraction,
    canShove,
    laneStatus,
    localLane,
    sweepFraction,
    tailgateOpen,
    truckHeadline,
} from '../minigames/Dock';
import { DRIVE_IN_SECONDS, bedSlots, lampLit, sagPx, truckSlide } from '../minigames/dock/TruckSprite';
import { STROBE_FLASH_MS, bayLabel, flashOn, returnsCount, strobeOn } from '../minigames/dock/BayWall';

/**
 * The overlay's arithmetic, away from Phaser. Everything the dock draws is a
 * function of the `mg` the server wrote and the server clock, so the pieces
 * that turn those numbers into a marker, a chip or a countdown can be checked
 * without a canvas — and the client still decides no outcome.
 */

const LANES: Tile[] = [
    [23, 4],
    [23, 5],
    [23, 6],
    [23, 7],
];

function lane(itemId = '', stalled = false, tile: Tile = [23, 4]): DockLane {
    return { tile, itemId, stalled };
}

function mg(over: Partial<DockMg> = {}): DockMg {
    return {
        truck: {
            phase: 'docked',
            arrivesAt: 20,
            leavesAt: 40,
            slots: 8,
            loaded: 0,
            hits: '',
            ...(over.truck ?? {}),
        },
        lanes: over.lanes ?? LANES.map((tile) => lane('', false, tile)),
        beepAt: over.beepAt ?? 20,
        beepPeriodMs: over.beepPeriodMs ?? 1000,
        windows: over.windows ?? { perfectMs: 70, okMs: 180 },
        tailgateUntil: over.tailgateUntil ?? 0,
        returnsTile: over.returnsTile ?? [19, 12],
    };
}

describe('laneStatus', () => {
    it('reads EMPTY for a lane with no stick on it', () => {
        expect(laneStatus(lane())).toBe('EMPTY');
    });

    it('reads READY for a staged stick', () => {
        expect(laneStatus(lane('s-3'))).toBe('READY');
    });

    it('reads STALLED for a stick a miss left halfway in', () => {
        expect(laneStatus(lane('s-3', true))).toBe('STALLED');
    });

    it('reads EMPTY for a lane index the mg does not carry', () => {
        expect(laneStatus(undefined)).toBe('EMPTY');
    });
});

describe('localLane', () => {
    it('finds the lane the player is standing on from their workTile', () => {
        expect(localLane(mg(), '23,6')).toBe(2);
    });

    it('is -1 off the ramp and with no work tile at all', () => {
        expect(localLane(mg(), '19,12')).toBe(-1);
        expect(localLane(mg(), '')).toBe(-1);
    });
});

describe('canShove', () => {
    it('allows a shove on a ready or stalled lane while the truck is docked', () => {
        const staged = mg({ lanes: [lane('s-1'), lane('s-2', true), lane(), lane()] });

        expect(canShove(staged, 0)).toBe(true);
        expect(canShove(staged, 1)).toBe(true);
    });

    it('refuses an empty lane, no lane, and a truck that is not docked', () => {
        const staged = mg({ lanes: [lane('s-1'), lane(), lane(), lane()] });

        expect(canShove(staged, 1)).toBe(false);
        expect(canShove(staged, -1)).toBe(false);
        expect(canShove(mg({ truck: { ...staged.truck, phase: 'away' }, lanes: staged.lanes }), 0)).toBe(
            false,
        );
    });
});

describe('tailgateOpen', () => {
    it('is open only until the server-stamped deadline', () => {
        expect(tailgateOpen(mg({ tailgateUntil: 33 }), 32.9)).toBe(true);
        expect(tailgateOpen(mg({ tailgateUntil: 33 }), 33)).toBe(false);
        expect(tailgateOpen(mg(), 5)).toBe(false);
    });
});

describe('sweepFraction', () => {
    it('puts the marker on the target line at the beep', () => {
        expect(sweepFraction(0)).toBeCloseTo(0.5, 6);
    });

    it('sweeps left to right and wraps at the point furthest from a beep', () => {
        expect(sweepFraction(0.25)).toBeCloseTo(0.75, 6);
        expect(sweepFraction(0.5)).toBeCloseTo(0, 6);
        expect(sweepFraction(0.75)).toBeCloseTo(0.25, 6);
    });
});

describe('bandHalfFraction', () => {
    it('draws the OK and Perfect windows to scale against one beep period', () => {
        expect(bandHalfFraction(180, 1000)).toBeCloseTo(0.18, 6);
        expect(bandHalfFraction(70, 1000)).toBeCloseTo(0.07, 6);
    });

    it('never spills past half a period or divides by a stopped beep', () => {
        expect(bandHalfFraction(900, 1000)).toBe(0.5);
        expect(bandHalfFraction(180, 0)).toBe(0);
    });
});

describe('truckHeadline', () => {
    it('counts the load and the time left while the truck is docked', () => {
        expect(truckHeadline(mg({ truck: { ...mg().truck, loaded: 3 } }), 28)).toBe('TRUCK 3/8 · 00:12');
    });

    it('counts down to the next truck while it is away', () => {
        expect(truckHeadline(mg({ truck: { ...mg().truck, phase: 'away', arrivesAt: 80 } }), 42)).toBe(
            'NEXT TRUCK 00:38',
        );
    });

    it('says the truck is pulling out while it leaves', () => {
        expect(truckHeadline(mg({ truck: { ...mg().truck, phase: 'leaving' } }), 40)).toBe('TRUCK LEAVING');
    });
});

describe('DOCK_LEGEND', () => {
    it('names every key the dock answers to', () => {
        expect(DOCK_LEGEND).toContain('SPACE');
        expect(DOCK_LEGEND).toContain('E');
        expect(DOCK_LEGEND).toContain('ESC');
    });
});

describe('bayLabel', () => {
    it('counts the docked truck down to its departure', () => {
        expect(bayLabel(mg(), 28)).toEqual({ text: '00:12', kind: 'countdown' });
    });

    it('counts an away or leaving truck up to the next arrival', () => {
        expect(bayLabel(mg({ truck: { ...mg().truck, phase: 'away', arrivesAt: 80 } }), 75)).toEqual({
            text: 'NEXT 00:05',
            kind: 'next',
        });
        expect(bayLabel(mg({ truck: { ...mg().truck, phase: 'leaving', arrivesAt: 80 } }), 41)).toEqual({
            text: 'NEXT 00:39',
            kind: 'next',
        });
    });

    it('shouts SLAM IT for as long as the tailgate window is open', () => {
        expect(bayLabel(mg({ tailgateUntil: 33 }), 32)).toEqual({ text: 'SLAM IT', kind: 'slam' });
    });
});

describe('strobeOn', () => {
    it('lights the bay for the flash after each beep', () => {
        expect(strobeOn(20, 1000, 20, STROBE_FLASH_MS)).toBe(true);
        expect(strobeOn(20, 1000, 20.05, STROBE_FLASH_MS)).toBe(true);
        expect(strobeOn(20, 1000, 22, STROBE_FLASH_MS)).toBe(true);
    });

    it('is dark between beeps and before the truck has arrived', () => {
        expect(strobeOn(20, 1000, 20.5, STROBE_FLASH_MS)).toBe(false);
        expect(strobeOn(20, 1000, 19.9, STROBE_FLASH_MS)).toBe(false);
    });
});

describe('flashOn', () => {
    it('blinks at the given rate off the server clock', () => {
        expect(flashOn(0, 4)).toBe(true);
        expect(flashOn(0.3, 4)).toBe(false);
        expect(flashOn(0.5, 4)).toBe(true);
    });
});

describe('returnsCount', () => {
    const items = [
        { holder: '', x: 19, y: 12, inFlight: false },
        { holder: '', x: 20, y: 13, inFlight: false },
        { holder: '', x: 17, y: 12, inFlight: false },
        { holder: 'abc', x: -1, y: -1, inFlight: false },
        { holder: 'dock-a', x: 23, y: 4, inFlight: false },
        { holder: '', x: 19, y: 11, inFlight: true },
    ];

    it('counts the floor items the pile spread around the returns tile', () => {
        expect(returnsCount(items, [19, 12])).toBe(2);
    });

    it('counts nothing when the pile is empty', () => {
        expect(returnsCount([], [19, 12])).toBe(0);
    });
});

describe('bedSlots', () => {
    it('lays every slot out in two columns on the bed', () => {
        const slots = bedSlots(8, 96, 192);

        expect(slots).toHaveLength(8);
        expect(slots[0]?.x).toBeLessThan(slots[1]?.x ?? 0);
        expect(slots[2]?.y).toBeGreaterThan(slots[0]?.y ?? 0);
        expect(slots[2]?.x).toBeCloseTo(slots[0]?.x ?? -1, 6);
    });

    it('grows the row count with the truck and keeps every slot on the bed', () => {
        const slots = bedSlots(13, 96, 192);

        expect(slots).toHaveLength(13);
        expect(slots[12]?.x).toBeCloseTo(slots[0]?.x ?? -1, 6);

        for (const slot of slots) {
            expect(slot.x).toBeGreaterThanOrEqual(0);
            expect(slot.y).toBeGreaterThanOrEqual(0);
            expect(slot.x + slot.w).toBeLessThanOrEqual(96);
            expect(slot.y + slot.h).toBeLessThanOrEqual(192);
        }
    });

    it('draws nothing for a truck with no slots', () => {
        expect(bedSlots(0, 96, 192)).toEqual([]);
    });
});

describe('sagPx', () => {
    it('drops the bed a pixel per stick and stops at the springs', () => {
        expect(sagPx(0, 6)).toBe(0);
        expect(sagPx(3, 6)).toBe(3);
        expect(sagPx(9, 6)).toBe(6);
    });
});

describe('lampLit', () => {
    it('lights the lamp over a slot a THUD filled and leaves a scrape dark', () => {
        expect(lampLit('PO', 0)).toBe(true);
        expect(lampLit('PO', 1)).toBe(false);
        expect(lampLit('PO', 2)).toBe(false);
    });
});

describe('truckSlide', () => {
    it('parks the truck off the map while it is away', () => {
        expect(truckSlide('away', 10, 20, null, 1.5)).toBe(1);
    });

    it('slides the truck in over the drive-in from arrivesAt', () => {
        expect(truckSlide('docked', 20, 20, null, 1.5)).toBe(1);
        expect(truckSlide('docked', 20 + DRIVE_IN_SECONDS / 2, 20, null, 1.5)).toBeCloseTo(0.5, 6);
        expect(truckSlide('docked', 25, 20, null, 1.5)).toBe(0);
    });

    it('slides it out over leaveSeconds from the moment the view saw it leave', () => {
        expect(truckSlide('leaving', 40, 20, 40, 1.5)).toBe(0);
        expect(truckSlide('leaving', 40.75, 20, 40, 1.5)).toBeCloseTo(0.5, 6);
        expect(truckSlide('leaving', 43, 20, 40, 1.5)).toBe(1);
    });

    it('holds the truck still when it joined mid-departure and never saw the flip', () => {
        expect(truckSlide('leaving', 40.75, 20, null, 1.5)).toBe(0);
    });
});
