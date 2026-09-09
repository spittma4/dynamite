import { describe, expect, it } from 'vitest';

import { RemoteTrack } from '../render/Interpolation';

describe('RemoteTrack', () => {
    it('interpolates between the two samples that bracket the render time', () => {
        const track = new RemoteTrack();

        track.push(1, 1, 1_000);
        track.push(3, 5, 1_100);

        expect(track.at(1_050)).toEqual({ x: 2, y: 3 });
    });

    it('holds the newest sample when the render time is past it', () => {
        const track = new RemoteTrack();

        track.push(1, 1, 1_000);
        track.push(3, 5, 1_100);

        expect(track.at(9_000)).toEqual({ x: 3, y: 5 });
    });

    it('holds the oldest sample when the render time is before it', () => {
        const track = new RemoteTrack();

        track.push(1, 1, 1_000);
        track.push(3, 5, 1_100);

        expect(track.at(500)).toEqual({ x: 1, y: 1 });
    });

    it('returns null while it has no samples', () => {
        expect(new RemoteTrack().at(1_000)).toBeNull();
    });

    it('drops duplicate samples', () => {
        const track = new RemoteTrack();

        track.push(1, 1, 1_000);
        track.push(1, 1, 1_100);
        track.push(2, 1, 1_200);

        expect(track.at(1_100)).toEqual({ x: 1.5, y: 1 });
    });

    it('keeps at most four samples', () => {
        const track = new RemoteTrack();

        for (let i = 0; i < 6; i++) track.push(i, 0, 1_000 + i * 100);

        expect(track.at(1_000)).toEqual({ x: 2, y: 0 });
        expect(track.at(1_250)).toEqual({ x: 2.5, y: 0 });
    });
});
