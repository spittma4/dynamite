import { describe, expect, it } from 'vitest';

import { SHOUT_EVENT, newShout } from '../render/Avatars';

/**
 * The shout is the game's only crew-to-crew communication primitive, and it had
 * no channel that reaches a busy player: `AvatarView.bubble` draws a white
 * rounded rect over an avatar in the *world* layer, while `Host` mounts an
 * overlay a third of the floor tall over that world and `JigOverlay` captures
 * the movement keys. The person who most needs to read HELP is the one whose
 * eyes are locked on a needle.
 */
describe('newShout', () => {
    const LIVE = { bubble: 'HELP', bubbleUntil: 12, seenUntil: 0, serverNow: 10 };

    it('announces a live bubble nobody has announced yet', () => {
        expect(newShout(LIVE.bubble, LIVE.bubbleUntil, LIVE.seenUntil, LIVE.serverNow, false)).toBe(
            true,
        );
    });

    it('announces it once, however many frames the bubble stays up', () => {
        expect(newShout('HELP', 12, 12, 10, false)).toBe(false);
    });

    it('announces a second shout from the same player, which extends the bubble', () => {
        expect(newShout('STOP', 15, 12, 13, false)).toBe(true);
    });

    /** Your own shout is a key you just pressed; it is not news to you. */
    it('says nothing about your own', () => {
        expect(newShout('HELP', 12, 0, 10, true)).toBe(false);
    });

    it('says nothing about a bubble that has already expired', () => {
        expect(newShout('HELP', 9, 0, 10, false)).toBe(false);
    });

    it('says nothing about a player with no bubble at all', () => {
        expect(newShout('', 12, 0, 10, false)).toBe(false);
    });

    it('names the event once, so both ends cannot spell it differently', () => {
        expect(SHOUT_EVENT).toBe('crew-shout');
    });
});
