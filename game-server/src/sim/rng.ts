/**
 * mulberry32: one 32-bit word of state, no dependencies, and the same sequence
 * everywhere. A run's seed is stored with its report, so a replay of the same
 * seed rolls the same drops — which is the whole reason nothing in the sim
 * calls `Math.random`.
 */
export class Rng {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    next(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;

        let t = this.state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    int(minInclusive: number, maxExclusive: number): number {
        return minInclusive + Math.floor(this.next() * (maxExclusive - minInclusive));
    }

    chance(p: number): boolean {
        return this.next() < p;
    }

    pick<T>(items: readonly T[]): T {
        return items[this.int(0, items.length)] as T;
    }
}
