import type { Axis, EmoteKind } from '@shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Keys } from '../input/Keys';
import type { OverlayKey } from '../minigames/types';

/** Enough of Phaser's emitters to drive the bindings without a canvas. */
class FakeEmitter {
    readonly handlers = new Map<string, Array<(...args: never[]) => void>>();

    on(event: string, fn: (...args: never[]) => void): this {
        const list = this.handlers.get(event) ?? [];

        list.push(fn);
        this.handlers.set(event, list);

        return this;
    }

    off(event: string, fn: (...args: never[]) => void): this {
        const list = (this.handlers.get(event) ?? []).filter((f) => f !== fn);

        this.handlers.set(event, list);

        return this;
    }

    emit(event: string, ...args: unknown[]): void {
        for (const fn of [...(this.handlers.get(event) ?? [])]) {
            (fn as (...a: unknown[]) => void)(...args);
        }
    }
}

class FakeKeyboard extends FakeEmitter {
    readonly captured: string[] = [];

    addCapture(keycode: string): void {
        this.captured.push(keycode);
    }
}

let keyboard: FakeKeyboard;
let gameEvents: FakeEmitter;

function makeKeys(debugEnabled = true): Keys {
    keyboard = new FakeKeyboard();
    gameEvents = new FakeEmitter();

    const scene = {
        input: { keyboard },
        game: { events: gameEvents },
    } as unknown as Phaser.Scene;

    return new Keys(scene, debugEnabled);
}

function down(key: string, repeat = false): void {
    keyboard.emit(`keydown-${key}`, { repeat });
}

function up(key: string): void {
    keyboard.emit(`keyup-${key}`, { repeat: false });
}

describe('Keys', () => {
    beforeEach(() => {
        makeKeys();
    });

    it('captures the keys the browser would otherwise steal', () => {
        makeKeys();

        expect(keyboard.captured.join(',')).toContain('TAB');
        expect(keyboard.captured.join(',')).toContain('SPACE');
    });

    it('emits intent only when the pair changes', () => {
        const keys = makeKeys();
        const seen: Array<[Axis, Axis]> = [];

        keys.on('intent', (dx, dy) => seen.push([dx, dy]));

        down('D');
        down('D', true);
        up('D');

        expect(seen).toEqual([
            [1, 0],
            [0, 0],
        ]);
        expect(keys.intent).toEqual({ dx: 0, dy: 0 });
    });

    it('walks on arrows and on WASD alike', () => {
        const keys = makeKeys();

        down('LEFT');
        expect(keys.intent).toEqual({ dx: -1, dy: 0 });

        down('S');
        expect(keys.intent).toEqual({ dx: -1, dy: 1 });
    });

    it('turns Shift plus an arrow into an emote and takes the arrow out of the intent', () => {
        const keys = makeKeys();
        const emotes: EmoteKind[] = [];

        keys.on('emote', (kind) => emotes.push(kind));

        down('SHIFT');
        down('UP');

        expect(emotes).toEqual(['help']);
        expect(keys.intent).toEqual({ dx: 0, dy: 0 });
    });

    /**
     * F18's three keys. Without them the mute and the volume are four public
     * methods nobody can reach, and a player the soundscape overloads has no
     * recourse but muting the whole browser tab — which loses every cue at once.
     */
    it('toggles the mute on M, once per press', () => {
        const keys = makeKeys();
        let presses = 0;

        keys.on('mute', () => (presses += 1));

        down('M');
        down('M', true);

        expect(presses).toBe(1);
    });

    it('steps the volume down on the open bracket and up on the closed one', () => {
        const keys = makeKeys();
        const deltas: number[] = [];

        keys.on('volume', (delta) => deltas.push(delta));

        down('OPEN_BRACKET');
        down('CLOSED_BRACKET');

        expect(deltas).toEqual([-1, 1]);
    });

    it('repeats the volume while a bracket is held, because holding it is the point', () => {
        const keys = makeKeys();
        const deltas: number[] = [];

        keys.on('volume', (delta) => deltas.push(delta));

        down('CLOSED_BRACKET');
        down('CLOSED_BRACKET', true);

        expect(deltas).toEqual([1, 1]);
    });

    it('does not repeat an emote while the arrow is held', () => {
        const keys = makeKeys();
        const emotes: EmoteKind[] = [];

        keys.on('emote', (kind) => emotes.push(kind));

        down('SHIFT');
        down('RIGHT');
        down('RIGHT', true);

        expect(emotes).toEqual(['go']);
    });

    it('routes the arrows to the overlay while routing is on and keeps WASD walking', () => {
        const keys = makeKeys();
        const routed: Array<[OverlayKey, boolean, boolean]> = [];

        keys.on('overlayKey', (key, isDown, repeat) => routed.push([key, isDown, repeat]));
        keys.setOverlayRouting(true);

        down('LEFT');
        up('LEFT');
        down('W');

        expect(routed).toEqual([
            ['left', true, false],
            ['left', false, false],
        ]);
        expect(keys.intent).toEqual({ dx: 0, dy: -1 });
    });

    it('drops a held arrow out of the intent when routing turns on', () => {
        const keys = makeKeys();

        down('RIGHT');
        expect(keys.intent).toEqual({ dx: 1, dy: 0 });

        keys.setOverlayRouting(true);
        expect(keys.intent).toEqual({ dx: 0, dy: 0 });
    });

    it('reports the interact, action, leave, board, start and debug keys', () => {
        const keys = makeKeys();
        const log: string[] = [];

        keys.on('interact', (repeat) => log.push(`interact:${repeat}`));
        keys.on('interactUp', () => log.push('interactUp'));
        keys.on('action', (repeat) => log.push(`action:${repeat}`));
        keys.on('actionUp', () => log.push('actionUp'));
        keys.on('leave', () => log.push('leave'));
        keys.on('board', (open) => log.push(`board:${open}`));
        keys.on('start', () => log.push('start'));
        keys.on('debug', () => log.push('debug'));

        down('E');
        down('E', true);
        up('E');
        down('SPACE');
        up('SPACE');
        down('ESC');
        down('TAB');
        up('TAB');
        down('ENTER');
        down('BACKTICK');

        expect(log).toEqual([
            'interact:false',
            'interact:true',
            'interactUp',
            'action:false',
            'actionUp',
            'leave',
            'board:true',
            'board:false',
            'start',
            'debug',
        ]);
    });

    it('ignores the debug key when the mount did not ask for it', () => {
        const keys = makeKeys(false);
        const toggled = vi.fn();

        keys.on('debug', toggled);
        down('BACKTICK');

        expect(toggled).not.toHaveBeenCalled();
    });

    it('lets a listener unsubscribe', () => {
        const keys = makeKeys();
        const seen = vi.fn();
        const off = keys.on('leave', seen);

        off();
        down('ESC');

        expect(seen).not.toHaveBeenCalled();
    });

    it('rests the intent and releases held keys when the window blurs', () => {
        const keys = makeKeys();
        const log: string[] = [];

        keys.on('interactUp', () => log.push('interactUp'));
        keys.on('board', (open) => log.push(`board:${open}`));
        keys.on('intent', (dx, dy) => log.push(`intent:${dx},${dy}`));

        down('D');
        down('E');
        down('TAB');
        log.length = 0;

        gameEvents.emit('blur');

        expect(keys.intent).toEqual({ dx: 0, dy: 0 });
        expect(log).toEqual(['intent:0,0', 'interactUp', 'board:false']);
    });

    it('rests the intent when the tab is hidden', () => {
        const keys = makeKeys();

        down('W');
        gameEvents.emit('hidden');

        expect(keys.intent).toEqual({ dx: 0, dy: 0 });
    });
});
