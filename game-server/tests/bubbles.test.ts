import { describe, expect, it } from 'vitest';

import { copy } from '../src/shared';
import type { PlayerState } from '../src/shared';
import { EMOTE_BUBBLE_SECONDS, EMOTE_COOLDOWN_SECONDS, emote, setBubble } from '../src/sim/bubbles';
import type { World } from '../src/sim/World';
import { makeWorld } from './helpers/world';

function seated(world: World, sessionId = 'session-0'): PlayerState {
    const player = world.state.players.get(sessionId);

    if (player === undefined) throw new Error(`no player ${sessionId}`);

    return player;
}

function run(world: World, seconds: number): void {
    for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 0.05) world.tick(0.05);
}

describe('bubblesSystem', () => {
    it('clears a bubble and a banner once their until passes', () => {
        const world = makeWorld({ players: 1 });
        const player = seated(world);

        setBubble(world, player, 'HELLO', 0.1);
        world.state.banner = 'WHOOPS';
        world.state.bannerUntil = 0.1;

        world.tick(0.05);

        expect(player.bubble).toBe('HELLO');
        expect(world.state.banner).toBe('WHOOPS');

        world.tick(0.05);

        expect(player.bubble).toBe('');
        expect(player.bubbleUntil).toBe(0);
        expect(world.state.banner).toBe('');
        expect(world.state.bannerUntil).toBe(0);
    });

    it('expires bubbles in the lobby, where emotes already work', () => {
        const world = makeWorld({ players: 1 });
        const player = seated(world);

        expect(world.state.phase).toBe('lobby');

        setBubble(world, player, 'HELLO', 0.05);
        world.tick(0.05);

        expect(player.bubble).toBe('');
    });
});

describe('emote', () => {
    it('sets the copy line for the emote kind for 2 s', () => {
        const world = makeWorld({ players: 1 });
        const player = seated(world);

        world.tick(0.05);
        emote(world, player, 'stop');

        expect(player.bubble).toBe(copy.emotes.stop);
        expect(player.bubbleUntil).toBeCloseTo(world.now + EMOTE_BUBBLE_SECONDS, 9);
        expect(EMOTE_BUBBLE_SECONDS).toBe(2);
    });

    it('rate-limits a player to one emote per half second', () => {
        const world = makeWorld({ players: 1 });
        const player = seated(world);

        world.tick(0.05);
        emote(world, player, 'stop');
        run(world, EMOTE_COOLDOWN_SECONDS - 0.1);
        emote(world, player, 'help');

        expect(player.bubble).toBe(copy.emotes.stop);

        run(world, 0.2);
        emote(world, player, 'help');

        expect(player.bubble).toBe(copy.emotes.help);
    });

    it('lets a player emote again after the clock rewinds at the start of the day', () => {
        const world = makeWorld({ players: 1 });
        const player = seated(world);

        run(world, 1);
        emote(world, player, 'go');
        world.state.clock = 0;
        emote(world, player, 'what');

        expect(player.bubble).toBe(copy.emotes.what);
    });
});
