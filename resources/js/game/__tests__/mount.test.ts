import { describe, expect, it } from 'vitest';

import { readMount } from '../mount';

function element(attrs: Record<string, string>): HTMLElement {
    return {
        getAttribute: (name: string): string | null => attrs[name] ?? null,
    } as unknown as HTMLElement;
}

const complete = {
    'data-ticket-url': 'https://dynamite.test/game/ticket',
    'data-factory-id': '1',
    'data-ws-url': 'ws://127.0.0.1:2567',
    'data-csrf': 'token-abc',
    'data-debug': '1',
    'data-factory-url': 'https://dynamite.test/factories/1',
};

describe('readMount', () => {
    it('parses the six attributes and debug "1" as true', () => {
        expect(readMount(element(complete))).toEqual({
            ticketUrl: 'https://dynamite.test/game/ticket',
            factoryId: '1',
            wsUrl: 'ws://127.0.0.1:2567',
            csrf: 'token-abc',
            debug: true,
            factoryUrl: 'https://dynamite.test/factories/1',
        });
    });

    it('reads debug "0" as false', () => {
        expect(readMount(element({ ...complete, 'data-debug': '0' })).debug).toBe(false);
    });

    it('throws naming the missing attribute', () => {
        const { 'data-ws-url': _dropped, ...missing } = complete;

        expect(() => readMount(element(missing))).toThrow('game mount: missing data-ws-url');
    });

    it('throws when an attribute is present but empty', () => {
        expect(() => readMount(element({ ...complete, 'data-csrf': '' }))).toThrow(
            'game mount: missing data-csrf',
        );
    });
});
