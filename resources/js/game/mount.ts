/**
 * The six `data-*` attributes on `#game` (contracts §6). A missing one means the
 * page itself is broken, so it throws before anything touches the network — a
 * blank canvas with a silent socket failure is much harder to diagnose.
 */

export interface MountData {
    ticketUrl: string;
    factoryId: string;
    wsUrl: string;
    csrf: string;
    debug: boolean;
    factoryUrl: string;
}

function attribute(el: HTMLElement, name: string): string {
    const value = el.getAttribute(`data-${name}`);

    if (value === null || value === '') throw new Error(`game mount: missing data-${name}`);

    return value;
}

export function readMount(el: HTMLElement): MountData {
    return {
        ticketUrl: attribute(el, 'ticket-url'),
        factoryId: attribute(el, 'factory-id'),
        wsUrl: attribute(el, 'ws-url'),
        csrf: attribute(el, 'csrf'),
        debug: attribute(el, 'debug') === '1',
        factoryUrl: attribute(el, 'factory-url'),
    };
}
