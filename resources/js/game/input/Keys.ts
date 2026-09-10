import type { Axis, EmoteKind, MoveInput } from '@shared';
import type Phaser from 'phaser';

import type { OverlayKey } from '../minigames/types';
import { type ArrowKey, type PressedKeys, emoteForArrow, intentFrom } from './intent';

/**
 * The keyboard, as typed events (F04 §5). Nothing here talks to the network:
 * the scene decides which message a press becomes, because the same `E` is an
 * interact on the floor and a mini-game op inside an overlay.
 */

export interface KeyEvents {
    intent: (dx: Axis, dy: Axis) => void;
    interact: (repeat: boolean) => void;
    interactUp: () => void;
    action: (repeat: boolean) => void;
    actionUp: () => void;
    leave: () => void;
    emote: (kind: EmoteKind) => void;
    /** `Tab` held opens the order board and releasing it closes it. */
    board: (open: boolean) => void;
    /** `H` toggles the help panel. */
    help: () => void;
    /** `M` toggles the mute (F18). */
    mute: () => void;
    /** `[` and `]`, as −1 and +1 steps of F18's twentieth-of-full grid. */
    volume: (delta: number) => void;
    debug: () => void;
    start: () => void;
    overlayKey: (key: OverlayKey, down: boolean, repeat: boolean) => void;
}

const ARROWS: Record<string, ArrowKey> = {
    LEFT: 'left',
    RIGHT: 'right',
    UP: 'up',
    DOWN: 'down',
};

const WALK = ['W', 'A', 'S', 'D'] as const;

export class Keys {
    /** Live and shared: the scene integrates this object every frame. */
    readonly intent: MoveInput = { dx: 0, dy: 0 };

    private readonly listeners = new Map<string, Set<unknown>>();
    private readonly pressed: PressedKeys = {
        w: false,
        a: false,
        s: false,
        d: false,
        up: false,
        down: false,
        left: false,
        right: false,
        shift: false,
    };
    private readonly overlayHeld = new Set<OverlayKey>();

    private interactHeld = false;
    private actionHeld = false;
    private boardHeld = false;
    private routing = false;

    constructor(scene: Phaser.Scene, private readonly debugEnabled: boolean) {
        const keyboard = scene.input.keyboard;

        if (!keyboard) throw new Error('Keys: the scene has no keyboard plugin');

        // Without this the browser scrolls on the arrows and moves focus on Tab.
        keyboard.addCapture('TAB,SPACE,UP,DOWN,LEFT,RIGHT');

        for (const key of WALK) {
            keyboard.on(`keydown-${key}`, () => this.walk(key, true));
            keyboard.on(`keyup-${key}`, () => this.walk(key, false));
        }

        for (const [code, arrow] of Object.entries(ARROWS)) {
            keyboard.on(`keydown-${code}`, (e: KeyboardEvent) => this.arrow(arrow, true, e.repeat));
            keyboard.on(`keyup-${code}`, () => this.arrow(arrow, false, false));
        }

        keyboard.on('keydown-SHIFT', () => this.shift(true));
        keyboard.on('keyup-SHIFT', () => this.shift(false));

        keyboard.on('keydown-E', (e: KeyboardEvent) => {
            this.interactHeld = true;
            this.emit('interact', e.repeat);
        });
        keyboard.on('keyup-E', () => {
            this.interactHeld = false;
            this.emit('interactUp');
        });

        keyboard.on('keydown-SPACE', (e: KeyboardEvent) => {
            this.actionHeld = true;
            this.emit('action', e.repeat);
        });
        keyboard.on('keyup-SPACE', () => {
            this.actionHeld = false;
            this.emit('actionUp');
        });

        keyboard.on('keydown-ESC', () => this.emit('leave'));

        keyboard.on('keydown-TAB', () => {
            if (this.boardHeld) return;

            this.boardHeld = true;
            this.emit('board', true);
        });
        keyboard.on('keyup-TAB', () => {
            this.boardHeld = false;
            this.emit('board', false);
        });

        keyboard.on('keydown-ENTER', (e: KeyboardEvent) => {
            if (!e.repeat) this.emit('start');
        });

        keyboard.on('keydown-H', (e: KeyboardEvent) => {
            if (!e.repeat) this.emit('help');
        });

        keyboard.on('keydown-M', (e: KeyboardEvent) => {
            if (!e.repeat) this.emit('mute');
        });

        // The brackets repeat on purpose: twenty presses cross the whole range,
        // and holding one is how a player actually crosses it. `M` does not —
        // a held mute key would flap the sound on and off at the repeat rate.
        keyboard.on('keydown-OPEN_BRACKET', () => this.emit('volume', -1));
        keyboard.on('keydown-CLOSED_BRACKET', () => this.emit('volume', 1));

        keyboard.on('keydown-BACKTICK', (e: KeyboardEvent) => {
            if (this.debugEnabled && !e.repeat) this.emit('debug');
        });

        // A key held when the tab goes away never sends its keyup, so the game
        // has to let go on the player's behalf or they walk into a wall for
        // as long as they are reading their email.
        scene.game.events.on('blur', () => this.resetAll());
        scene.game.events.on('hidden', () => this.resetAll());
    }

    on<E extends keyof KeyEvents>(event: E, fn: KeyEvents[E]): () => void {
        const set = this.listeners.get(event) ?? new Set<unknown>();

        set.add(fn);
        this.listeners.set(event, set);

        return () => {
            set.delete(fn);
        };
    }

    /** `true` hands the arrows to the overlay; WASD keeps walking either way. */
    setOverlayRouting(on: boolean): void {
        if (this.routing === on) return;

        this.routing = on;
        this.overlayHeld.clear();
        this.refreshIntent();
    }

    resetAll(): void {
        for (const key of Object.keys(this.pressed) as Array<keyof PressedKeys>) {
            this.pressed[key] = false;
        }

        this.overlayHeld.clear();
        this.refreshIntent();

        if (this.interactHeld) {
            this.interactHeld = false;
            this.emit('interactUp');
        }

        if (this.actionHeld) {
            this.actionHeld = false;
            this.emit('actionUp');
        }

        if (this.boardHeld) {
            this.boardHeld = false;
            this.emit('board', false);
        }
    }

    private walk(key: (typeof WALK)[number], down: boolean): void {
        this.pressed[key.toLowerCase() as 'w' | 'a' | 's' | 'd'] = down;
        this.refreshIntent();
    }

    private shift(down: boolean): void {
        this.pressed.shift = down;
        this.refreshIntent();
    }

    private arrow(arrow: ArrowKey, down: boolean, repeat: boolean): void {
        this.pressed[arrow] = down;
        this.refreshIntent();

        if (this.pressed.shift) {
            if (down && !repeat) this.emit('emote', emoteForArrow(arrow));

            return;
        }

        if (!this.routing) return;

        if (down) {
            this.overlayHeld.add(arrow);
            this.emit('overlayKey', arrow, true, repeat);
        } else if (this.overlayHeld.delete(arrow)) {
            this.emit('overlayKey', arrow, false, false);
        }
    }

    private refreshIntent(): void {
        const walking = this.routing
            ? { ...this.pressed, up: false, down: false, left: false, right: false }
            : this.pressed;
        const next = intentFrom(walking);

        if (next.dx === this.intent.dx && next.dy === this.intent.dy) return;

        this.intent.dx = next.dx;
        this.intent.dy = next.dy;
        this.emit('intent', next.dx, next.dy);
    }

    private emit<E extends keyof KeyEvents>(event: E, ...args: Parameters<KeyEvents[E]>): void {
        for (const fn of this.listeners.get(event) ?? []) {
            (fn as (...a: Parameters<KeyEvents[E]>) => void)(...args);
        }
    }
}
