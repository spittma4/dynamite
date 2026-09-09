import { describe, expect, it, vi } from 'vitest';

import { closeDetail, fetchTicket, nextInputSeq, reconnectKey } from '../net/connection';
import type { MountData } from '../mount';

const MOUNT: MountData = {
    ticketUrl: 'https://dynamite.test/game/ticket',
    factoryId: '7',
    wsUrl: 'ws://localhost:2567',
    csrf: 'csrf-token',
    debug: true,
    factoryUrl: 'https://dynamite.test/factories/7',
};

function respondWith(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
    const json = vi.fn().mockResolvedValue(body);

    return vi.fn().mockResolvedValue({ ok, status, json });
}

describe('reconnectKey', () => {
    it('scopes the stored token to the factory', () => {
        expect(reconnectKey('7')).toBe('dynamite.reconnect.7');
    });
});

describe('closeDetail', () => {
    it('names the close codes a player can act on', () => {
        expect(closeDetail(4003)).toBe('FAILED_TO_RECONNECT');
        expect(closeDetail(4001)).toBe('SERVER_SHUTDOWN');
    });

    it('keeps the number for anything else', () => {
        expect(closeDetail(1006)).toBe('code 1006');
    });
});

describe('fetchTicket', () => {
    it('posts the factory id with the CSRF header', async () => {
        const fetchMock = respondWith({ ticket: 't', ws_url: 'ws://x', room: 'factory' });

        vi.stubGlobal('fetch', fetchMock);

        const response = await fetchTicket(MOUNT);

        expect(response.ticket).toBe('t');

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

        expect(url).toBe(MOUNT.ticketUrl);
        expect(init.method).toBe('POST');
        expect(init.credentials).toBe('same-origin');
        expect(init.body).toBe('{"factory_id":"7"}');
        expect(init.headers).toMatchObject({
            'X-CSRF-TOKEN': 'csrf-token',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/json',
        });

        vi.unstubAllGlobals();
    });

    it('throws with the status when Laravel refuses', async () => {
        vi.stubGlobal('fetch', respondWith({}, false, 419));

        await expect(fetchTicket(MOUNT)).rejects.toThrow('ticket: HTTP 419');

        vi.unstubAllGlobals();
    });
});

describe('nextInputSeq', () => {
    it('counts up from the local counter while the socket holds', () => {
        expect(nextInputSeq(11, 11)).toBe(12);
        expect(nextInputSeq(12, 9)).toBe(13);
    });

    it('starts at 1 on a first join, where the seat has applied nothing', () => {
        expect(nextInputSeq(0, undefined)).toBe(1);
        expect(nextInputSeq(0, 0)).toBe(1);
    });

    it('jumps past the seat the server kept when a reload resumes it', () => {
        // The server drops any input whose seq went backwards, so a fresh page
        // may not restart the count on a seat that already applied 812.
        expect(nextInputSeq(0, 812)).toBe(813);
    });
});
