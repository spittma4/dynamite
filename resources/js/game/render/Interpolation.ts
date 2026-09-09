/**
 * Remote avatars are drawn `INTERP_DELAY_MS` in the past so there is always a
 * pair of patches to interpolate between. Nothing extrapolates: a stalled
 * connection holds the last sample rather than walking a ghost into a wall.
 */

const MAX_SAMPLES = 4;

export interface Sample {
    t: number;
    x: number;
    y: number;
}

export interface Point {
    x: number;
    y: number;
}

export class RemoteTrack {
    private readonly samples: Sample[] = [];

    push(x: number, y: number, nowMs: number): void {
        const newest = this.samples[this.samples.length - 1];

        if (newest && newest.x === x && newest.y === y) return;

        this.samples.push({ t: nowMs, x, y });

        if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    }

    at(renderMs: number): Point | null {
        const first = this.samples[0];
        const last = this.samples[this.samples.length - 1];

        if (!first || !last) return null;
        if (renderMs <= first.t) return { x: first.x, y: first.y };
        if (renderMs >= last.t) return { x: last.x, y: last.y };

        for (let i = 1; i < this.samples.length; i++) {
            const a = this.samples[i - 1];
            const b = this.samples[i];

            if (!a || !b || renderMs > b.t) continue;

            const span = b.t - a.t;
            const alpha = span > 0 ? (renderMs - a.t) / span : 1;

            return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
        }

        return { x: last.x, y: last.y };
    }
}
