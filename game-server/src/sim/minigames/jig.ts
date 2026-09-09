import {
    BUBBLE_SECONDS,
    FACING_DIRS,
    LEVEL_DEFAULTS,
    copy,
    createJigState,
    deriveAisleTile,
    nearestTile,
    parseTileKey,
    reduceJig,
    stationStatus,
    toMg,
} from '../../shared';
import type {
    AssemblyMinigame,
    FuseLength,
    ItemState,
    ItemType,
    JigConfig,
    JigEffect,
    JigShelfEntry,
    JigState,
    JigTickView,
    JigTiles,
    MgOp,
    OrderState,
    PlayerState,
    StationConfig,
    Tile,
} from '../../shared';
import {
    addSpill,
    createItem,
    destroyItem,
    dropItem,
    giveToPlayer,
    placeNear,
    shelfPush,
} from '../items';
import { activeOrderId } from '../orders';
import type { Station } from '../stations';
import type { World } from '../World';
import type { MinigameInstance, MinigameModule, StationCtx } from './types';

/**
 * The Jig's server side (F08). It owns no rules: every tick it photographs the
 * world into a `JigTickView`, hands it to the pure reducer in
 * `shared/src/sim/jig.ts`, and spends whatever effects come back. Keeping the
 * judgement out of here is what lets the phrase be tested to the millisecond
 * without a station, a shelf or a socket.
 */

function assemblyConfig(world: World, cfg: StationConfig): JigConfig {
    const mg = cfg.minigame as AssemblyMinigame;

    return {
        ...mg,
        casings: mg.casings ?? { ...LEVEL_DEFAULTS.minigame.assembly.casings },
        bpm: world.level.bpm,
        // A recipe that does not say otherwise gets one stick out of a keg.
        kegPours: world.level.recipes.keg?.output.pours ?? 1,
    };
}

function tilesOf(cfg: StationConfig): JigTiles {
    const jig = cfg.workTiles;
    const rack = cfg.rackTiles;
    const first = rack[0];
    const fallback = jig[0] ?? cfg.anchor;

    return {
        jig,
        rack,
        aisle: first === undefined ? fallback : deriveAisleTile(first, nearestTile(first, jig)),
    };
}

function orderNumber(id: string): number {
    const n = Number(id.split('-')[1]);

    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/** The order chip: the next two jobs, in the order F09 will settle them. */
function openOrders(world: World): OrderState[] {
    const orders: OrderState[] = [];

    world.state.orders.forEach((order) => {
        if (order.status === 'open' || order.status === 'partial') orders.push(order);
    });

    return orders.sort((a, b) => orderNumber(a.id) - orderNumber(b.id));
}

/** Earliest `Member.joinedAt` first, which is what makes the first body A. */
function ordered(ctx: StationCtx, players: PlayerState[]): string[] {
    return players
        .map((player) => ctx.sessionIdOf(player))
        .sort(
            (a, b) =>
                (ctx.station.members.get(a)?.joinedAt ?? 0) -
                (ctx.station.members.get(b)?.joinedAt ?? 0),
        );
}

function carriedItem(world: World, sessionId: string): ItemState | null {
    const carrying = world.state.players.get(sessionId)?.carrying ?? '';

    if (carrying === '' || carrying === 'broom') return null;

    return world.state.items.get(carrying) ?? null;
}

function partsOf(item: ItemState | null): { itemId: string; fuseLength: 'short' | 'long' } | null {
    if (item === null || item.type !== 'parts') return null;

    return { itemId: item.id, fuseLength: item.fuseLength === 'short' ? 'short' : 'long' };
}

/** The hauler: someone standing on a jig tile — not joined — with a set in hand. */
function partsOnJig(world: World, tiles: JigTiles): JigTickView['partsOnJigTile'] {
    for (const [tx, ty] of tiles.jig) {
        for (const sessionId of world.playersAt(tx, ty)) {
            const parts = partsOf(carriedItem(world, sessionId));

            if (parts !== null) return { sessionId, ...parts };
        }
    }

    return null;
}

function shelfView(items: ItemState[]): JigShelfEntry[] {
    return items.map((item, index) => ({
        index,
        itemId: item.id,
        type: item.type as ItemType,
        dents: item.dents,
        quality: item.quality,
        prime: item.prime,
    }));
}

function aTileOf(world: World, state: JigState, operator: string | undefined): Tile {
    const key = operator === undefined ? '' : (world.state.players.get(operator)?.workTile ?? '');

    return parseTileKey(key) ?? state.aTile;
}

function buildView(ctx: StationCtx, state: JigState, dt: number): JigTickView {
    const world = ctx.world;
    const shelf = shelfView(ctx.inputShelf());
    const operators = ordered(ctx, ctx.operators);
    const rackHands = ordered(ctx, ctx.rackHands);
    const [ax, ay] = state.tiles.aisle;
    const a = operators[0];
    const b = rackHands[0];
    const bItem = b === undefined ? null : carriedItem(world, b);

    return {
        now: ctx.now,
        dt,
        paused: ctx.paused,
        cycleIdle: ctx.phase === 'idle',
        rearmAt: ctx.rearmAt,
        operators,
        rackHands,
        shelf,
        casingCount: shelf.filter((entry) => entry.type === 'casing').length,
        shelfRoom: Math.max(ctx.station.st.inputCap - ctx.station.st.inputShelf.length, 0),
        activeOrderId: activeOrderId(world),
        orders: openOrders(world).map((order) => ({
            orderId: order.id,
            fuseLength: order.fuseLength as FuseLength,
        })),
        aisleFloorItem: world.itemsAt(ax, ay).length > 0,
        bodyOnAisle: world.playersAt(ax, ay)[0] ?? '',
        partsOnJigTile: partsOnJig(world, state.tiles),
        aTile: aTileOf(world, state, a),
        aCarrying: a === undefined ? '' : (world.state.players.get(a)?.carrying ?? ''),
        bCarrying: b === undefined ? '' : (world.state.players.get(b)?.carrying ?? ''),
        bParts: partsOf(bItem),
    };
}

function centreOf(tile: Tile): [number, number] {
    return [tile[0] + 0.5, tile[1] + 0.5];
}

function stockCasing(ctx: StationCtx, dents: number): void {
    const item = createItem(ctx.world, 'casing', { dents });

    if (!shelfPush(ctx.world, ctx.station.st, 'in', item)) destroyItem(ctx.world, item.id);
}

function toFloor(world: World, itemId: string, tile: Tile): void {
    const item = world.state.items.get(itemId);

    if (item === undefined) return;

    // Nowhere within two tiles of the aisle to put it: the set stays in the
    // hands that threw it rather than being deleted, and the next tick reads
    // those hands as a swing waiting to happen.
    if (!placeNear(world, item, tile)) world.log(`jig: no room beside ${tile.join(',')}`);
}

/** The stick pops off the jig when A walks out mid-crimp (docs/17's drop table). */
function popStick(ctx: StationCtx, effect: Extract<JigEffect, { e: 'dropStick' }>): void {
    const world = ctx.world;
    const item = createItem(world, 'stick', { ...effect.item });
    const facing = world.state.players.get(effect.culpritId)?.facing ?? 0;

    dropItem(world, item, effect.origin, FACING_DIRS[facing] ?? [1, 0], effect.culpritId);
}

function applyOne(ctx: StationCtx, effect: JigEffect): void {
    const world = ctx.world;

    switch (effect.e) {
        case 'consume':
            // The shelf is read a tick before the message that spends it; a slot
            // that moved in between is not worth throwing a room away for.
            if (ctx.inputShelf().some((item) => item.id === effect.itemId)) {
                ctx.consume(effect.itemId);
            }

            return;

        case 'destroyItem':
            destroyItem(world, effect.itemId);

            return;

        case 'stockCasing':
            stockCasing(ctx, effect.dents);

            return;

        case 'createParts': {
            const parts = createItem(world, 'parts', { fuseLength: effect.fuseLength });

            if (!giveToPlayer(world, parts, effect.sessionId)) destroyItem(world, parts.id);

            return;
        }

        case 'partsToFloor':
            toFloor(world, effect.itemId, effect.tile);

            return;

        case 'complete':
            ctx.complete({
                item: { type: 'stick', ...effect.item, handsOf: effect.handsOf },
                perfect: effect.perfect,
            });

            return;

        case 'dropStick':
            popStick(ctx, effect);

            return;

        case 'abort':
            ctx.abort();

            return;

        case 'spill':
            addSpill(world, effect.tile);

            return;

        case 'spark': {
            // Contracts §10.5: the caller rolls, F10 picks the ring tile.
            // TODO(F10): `hazards.sparkRing(world, ctx.cfg.id, 'crimpOnDented')`
            // when the roll comes up.
            const lit = world.rng.chance(world.level.hazards.sparks.crimpOnDented);

            world.log(`${ctx.cfg.id}: crimp on a dented casing ${lit ? 'sparked' : 'held'}`);

            return;
        }

        case 'fx':
            ctx.fx(effect.kind, effect.x, effect.y);

            return;

        case 'bubble':
            ctx.bubble(effect.sessionId, copy.bubbles.whoThrewThat, BUBBLE_SECONDS);

            return;

        case 'primeStick':
            world.grooveEvents.primeSticks++;
            ctx.fx('chime', ...centreOf(ctx.cfg.anchor), {
                text: copy.events.primeStick ?? '',
            });

            return;

        case 'tally':
            world.tally.bump(effect.key);

            return;

        default:
            return;
    }
}

function apply(ctx: StationCtx, state: JigState, effects: JigEffect[]): void {
    for (const effect of effects) {
        if (effect.e !== 'beginCycle') {
            applyOne(ctx, effect);

            continue;
        }

        // Nothing has been spent yet when the cycle is refused, so the rest of
        // the batch — the casing this seat was going to eat — is dropped.
        if (!ctx.beginCycle()) {
            apply(ctx, state, reduceJig(state, { t: 'refused' }, rngOf(ctx)));

            return;
        }
    }
}

export const jigModule: MinigameModule = {
    create(station: Station): MinigameInstance {
        let state: JigState | null = null;

        // The level is only scaled at the whistle, and `build` runs in the
        // lobby, so the config is read the first time the day actually needs it.
        const jig = (ctx: StationCtx): JigState => {
            if (state === null) {
                const cfg = assemblyConfig(ctx.world, station.cfg);

                state = createJigState(cfg, tilesOf(station.cfg));
            }

            return state;
        };

        const statusOf = (
            ctx: StationCtx,
        ): { state: 'idle' | 'starved' | 'working'; progress: number } => {
            const current = jig(ctx);

            return stationStatus(current, buildView(ctx, current, 0));
        };

        const run = (
            ctx: StationCtx,
            event: (view: JigTickView) => JigEffect[],
            dt: number,
        ): void => {
            const current = jig(ctx);

            apply(ctx, current, event(buildView(ctx, current, dt)));
            ctx.setMg(toMg(current));
        };

        return {
            // A member arrives on the clipboard, so they are not an operator
            // yet: the tick that first sees them in `ctx.operators` seats them.
            onJoin(): void {},

            onLeave(ctx: StationCtx, player: PlayerState): void {
                const sessionId = ctx.sessionIdOf(player);

                run(ctx, () => reduceJig(jig(ctx), { t: 'leave', sessionId }, rngOf(ctx)), 0);
            },

            /** The jig has no use for `E`, so F05 reads the press as a leave. */
            onInteract(): boolean {
                return false;
            },

            onMessage(
                ctx: StationCtx,
                player: PlayerState,
                op: MgOp,
                v: number | string | undefined,
                t: number,
            ): void {
                const sessionId = ctx.sessionIdOf(player);
                const at = ctx.world.inputClock(sessionId, t);

                const input = (view: JigTickView): JigEffect[] =>
                    reduceJig(jig(ctx), { t: 'input', sessionId, op, v, at, view }, rngOf(ctx));

                run(ctx, input, 0);
            },

            tick(ctx: StationCtx, dt: number): void {
                run(ctx, (view) => reduceJig(jig(ctx), { t: 'tick', view }, rngOf(ctx)), dt);
            },

            starved: (ctx: StationCtx): boolean => statusOf(ctx).state === 'starved',

            status: statusOf,
        };
    },
};

function rngOf(ctx: StationCtx): () => number {
    return () => ctx.world.rng.next();
}
