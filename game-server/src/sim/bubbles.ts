import { copy } from '../shared';
import type { EmoteKind, PlayerState } from '../shared';
import type { System, World } from './World';

/**
 * Speech bubbles and the banner are write-and-forget: whoever raises one sets
 * the text and the `clock` second it dies, and this system is the only thing
 * that takes it down again (contracts §3, F03 §Bubbles). It runs in the lobby
 * as well, because emotes do.
 */

export const EMOTE_BUBBLE_SECONDS = 2;
export const EMOTE_COOLDOWN_SECONDS = 0.5;

export function setBubble(world: World, player: PlayerState, text: string, seconds: number): void {
    player.bubble = text;
    player.bubbleUntil = world.now + seconds;
}

export function emote(world: World, player: PlayerState, kind: EmoteKind): void {
    const runtime = world.runtime(world.sessionIdOf(player));
    const sinceLast = world.now - runtime.lastEmoteAt;

    // `lastEmoteAt` is 0 until the first emote, and `startDay` rewinds the clock
    // behind it, so a zero or negative gap is a fresh start rather than a repeat.
    if (runtime.lastEmoteAt !== 0 && sinceLast >= 0 && sinceLast < EMOTE_COOLDOWN_SECONDS) return;

    runtime.lastEmoteAt = world.now;
    setBubble(world, player, copy.emotes[kind], EMOTE_BUBBLE_SECONDS);
}

export const bubblesSystem: System = {
    name: 'bubbles',

    tick(world: World): void {
        const now = world.now;

        world.state.players.forEach((player) => {
            if (player.bubble !== '' && player.bubbleUntil <= now) {
                player.bubble = '';
                player.bubbleUntil = 0;
            }
        });

        if (world.state.banner !== '' && world.state.bannerUntil <= now) {
            world.state.banner = '';
            world.state.bannerUntil = 0;
        }
    },
};
