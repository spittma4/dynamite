import type { StationState } from '@shared';
import type Phaser from 'phaser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Factory } from '../scenes/Factory';
import type { StationView } from '../minigames/types';

/**
 * Phaser touches `window` at import time, so the scene module cannot load in the
 * node suite. `StationViewHost` needs none of it — only the class the scene is
 * declared against — so the runtime is stubbed and the lifecycle tested on its own.
 */
vi.mock('phaser', () => ({
    default: {
        Scene: class {},
        Scenes: { Events: { SHUTDOWN: 'shutdown', CREATE: 'create' } },
        Scale: { ScaleModes: { FIT: 3 }, Center: { CENTER_BOTH: 3 } },
    },
}));

const { StationViewHost } = await import('../scenes/Factory');

interface Recorded {
    created: { station: StationState; layer: unknown }[];
    updated: { id: string; serverNow: number }[];
    destroyed: string[];
}

function recorder(): { log: Recorded; make: () => StationView } {
    const log: Recorded = { created: [], updated: [], destroyed: [] };
    const make = (): StationView => {
        let id = '';

        return {
            create(_scene, station, layer) {
                id = station.id;
                log.created.push({ station, layer });
            },
            update(station, serverNow) {
                log.updated.push({ id: station.id, serverNow });
            },
            destroy() {
                log.destroyed.push(id);
            },
        };
    };

    return { log, make };
}

function station(id: string, type: string): StationState {
    return { id, type } as StationState;
}

const scene = {} as Factory;
const layer = { name: 'stations' } as unknown as Phaser.GameObjects.Container;

describe('StationViewHost', () => {
    let log: Recorded;
    let make: () => StationView;

    beforeEach(() => {
        ({ log, make } = recorder());
    });

    it('builds the registered view for a station that arrives, in the stations layer', () => {
        const host = new StationViewHost(scene, layer, { boom_powder: make });

        host.add(station('powder-a', 'boom_powder'));

        expect(log.created).toHaveLength(1);
        expect(log.created[0]?.station.id).toBe('powder-a');
        expect(log.created[0]?.layer).toBe(layer);
    });

    it('builds one view per station, not one per type', () => {
        const host = new StationViewHost(scene, layer, { boom_powder: make });

        host.add(station('powder-a', 'boom_powder'));
        host.add(station('powder-b', 'boom_powder'));

        expect(log.created.map((c) => c.station.id)).toEqual(['powder-a', 'powder-b']);
    });

    it('keeps one view for a station the decoder announces twice', () => {
        const host = new StationViewHost(scene, layer, { boom_powder: make });
        const powder = station('powder-a', 'boom_powder');

        host.add(powder);
        host.add(powder);

        expect(log.created).toHaveLength(1);
    });

    it('ignores a station whose type has registered nothing', () => {
        const host = new StationViewHost(scene, layer, { boom_powder: make });

        host.add(station('dock-a', 'dock'));

        expect(log.created).toEqual([]);
    });

    it('updates every mounted view every frame with the server clock', () => {
        const host = new StationViewHost(scene, layer, { boom_powder: make, dock: make });

        host.add(station('powder-a', 'boom_powder'));
        host.add(station('dock-a', 'dock'));
        host.update(12.5);

        expect(log.updated).toEqual([
            { id: 'powder-a', serverNow: 12.5 },
            { id: 'dock-a', serverNow: 12.5 },
        ]);
    });

    it('destroys a view when its station leaves and stops updating it', () => {
        const host = new StationViewHost(scene, layer, { boom_powder: make });

        host.add(station('powder-a', 'boom_powder'));
        host.remove('powder-a');
        host.update(3);

        expect(log.destroyed).toEqual(['powder-a']);
        expect(log.updated).toEqual([]);
    });

    it('destroys everything it built when the scene shuts down', () => {
        const host = new StationViewHost(scene, layer, { boom_powder: make, dock: make });

        host.add(station('powder-a', 'boom_powder'));
        host.add(station('dock-a', 'dock'));
        host.destroy();
        host.update(1);

        expect(log.destroyed).toEqual(['powder-a', 'dock-a']);
        expect(log.updated).toEqual([]);
    });
});
