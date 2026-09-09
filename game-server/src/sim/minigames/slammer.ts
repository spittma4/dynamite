import {
    LEVEL_DEFAULTS,
    bandDrift,
    boundedMs,
    chargeSeconds,
    comboTier,
    heatOf,
    idleMg,
    judgeRelease,
    kegFor,
    okWindowMs,
    targetMs,
} from '../../shared';
import type {
    BoomPowderMinigame,
    Chute,
    MgOp,
    PlayerState,
    Role,
    SlammerHeatConfig,
    SlammerMg,
    SlammerOutcome,
    StationConfig,
} from '../../shared';
import { addSpill } from '../items';
import type { Station } from '../stations';
import type { World } from '../World';
import type { MinigameInstance, MinigameModule, StationCtx } from './types';

/**
 * The Slammer (F07, docs/04). Mash three chutes, hold, release on the hairline.
 * The greed ceiling is the whole design: mashing faster halves the cycle *and*
 * halves the window, and the only outcome that makes fuel and lights it is the
 * late one — so a player who never slows down builds the pile and then sparks
 * it, which is the lesson the station exists to teach.
 */

/**
 * F10 owns `sparkRing` and does not exist yet, so the ring lives behind a seam
 * that defaults to doing nothing. F10 wires the real one in when it lands; a
 * late release still makes its damp keg either way.
 */
export type SparkRingHook = (world: World, stationId: string, cause: 'slammerRedline') => void;

const NO_SPARK: SparkRingHook = () => {};

let sparkRing: SparkRingHook = NO_SPARK;

export function setSparkHook(hook: SparkRingHook | null): void {
    sparkRing = hook ?? NO_SPARK;
}

const CHUTES: readonly Chute[] = ['l', 'u', 'r'];

function powderConfig(cfg: StationConfig): BoomPowderMinigame {
    return cfg.minigame as BoomPowderMinigame;
}

/** `validateLevelConfig` fills `overholdMs` in; the fallback is for a hand-built level. */
function resolveHeat(cfg: StationConfig): SlammerHeatConfig {
    const { heat } = powderConfig(cfg);

    return {
        ...heat,
        overholdMs: heat.overholdMs ?? LEVEL_DEFAULTS.minigame.boom_powder.heat.overholdMs,
    };
}

function chuteOf(v: number | string | undefined): Chute | null {
    return CHUTES.find((chute) => chute === v) ?? null;
}

export const slammerModule: MinigameModule = {
    create(station: Station): MinigameInstance {
        const heat = resolveHeat(station.cfg);
        const powder = powderConfig(station.cfg);
        const bannerSeconds =
            powder.comboBannerSeconds ?? LEVEL_DEFAULTS.minigame.boom_powder.comboBannerSeconds;

        let operatorId = '';
        let mg: SlammerMg = idleMg(heat, 0);

        // Clock seconds for what the server measures, client ms for what the
        // player measured; a judgement only ever compares like with like.
        let mashFirstAt = 0;
        let mashThirdAt = 0;
        let chargeAt = 0;
        let mashFirstT = 0;
        let mashThirdT = 0;
        let chargeT = 0;
        let bandCenterMs = 0;
        let okMs = 0;
        let chargeHeldMs = 0;

        function hopper(): [number, number] {
            return [station.st.anchorX + 0.5, station.st.anchorY + 0.5];
        }

        function rollDrift(world: World): number {
            return bandDrift(
                world.state.groove,
                world.level.groove.thresholds.churn,
                heat.churnBandDrift,
                world.rng.next(),
            );
        }

        function tolerance(world: World): number {
            return world.level.windowFloorsMs.ok;
        }

        function isOperator(ctx: StationCtx, player: PlayerState): boolean {
            return operatorId !== '' && ctx.sessionIdOf(player) === operatorId;
        }

        /** The one judgement path: a release, or the plunger blowing by itself. */
        function resolve(
            ctx: StationCtx,
            player: PlayerState,
            outcome: Exclude<SlammerOutcome, ''>,
            errorMs: number,
        ): void {
            const { world } = ctx;
            const hit = outcome === 'dead_center' || outcome === 'prime';
            const combo = hit ? mg.combo + 1 : 0;
            const wasTier = mg.tier;
            const tier = comboTier(combo, powder.comboTiers);
            const [hx, hy] = hopper();

            mg.combo = combo;
            mg.tier = tier;
            player.combo = combo;

            if (outcome === 'dead_center') ctx.fx('thunk', hx, hy, { size: 2 });
            else if (outcome === 'prime') ctx.fx('thunk', hx, hy, { size: 1 });
            else if (outcome === 'late') ctx.fx('pfft', hx, hy);
            else ctx.fx('clink', hx, hy);

            // Contracts §10.5: the caller rolls the cause, F10 picks the tile.
            if (outcome === 'late' && world.rng.next() < world.level.hazards.sparks.slammerRedline) {
                sparkRing(world, station.st.id, 'slammerRedline');
            }

            const { quality, prime } = kegFor(outcome);
            const where = ctx.complete({
                item: {
                    type: 'keg',
                    quality,
                    prime,
                    dents: 0,
                    fuseLength: '',
                    fill: 0,
                    capLoose: false,
                    frayed: false,
                    orderId: '',
                    handsOf: ctx.sessionIdOf(player),
                },
                perfect: outcome === 'dead_center',
            });

            if (tier >= 2 && wasTier < 2) {
                world.state.banner = 'HOT STREAK';
                world.state.bannerUntil = ctx.now + bannerSeconds;
            }

            // Re-rolled now rather than at the next mash, so the overlay can
            // draw the band the player is about to aim at.
            mg.bandOffset = rollDrift(world);
            mg.mashed = [];
            mg.chargeStartAt = 0;
            mg.tCharge = 0;
            mg.okMs = 0;
            mg.lastOutcome = outcome;
            mg.lastErrorMs = Math.round(errorMs);
            mg.phase = where === 'hands' ? 'hands' : 'idle';
            chargeHeldMs = 0;

            ctx.setMg(mg);
        }

        function onMash(ctx: StationCtx, player: PlayerState, chute: Chute, t: number): void {
            if (mg.phase === 'idle') {
                if (!ctx.beginCycle()) return;

                mg.phase = 'mash';
                mg.mashed = [chute];
                mashFirstAt = ctx.now;
                mashFirstT = t;

                ctx.setMg(mg);

                return;
            }

            if (!mg.mashed.includes(chute) && mg.mashed.length < 3) {
                mg.mashed.push(chute);

                if (mg.mashed.length === 3) {
                    mashThirdAt = ctx.now;
                    mashThirdT = t;
                }

                ctx.setMg(mg);

                return;
            }

            // "Three is enough", taught in 200 ms with no popup: the overflow
            // is a spill at the operator's own feet, theirs to sweep. The mash
            // stands — a repeat still leaves the missing chute to press — and
            // the combo stands too, because a fumble is not a miss.
            ctx.fx('slop', ...hopper());

            if (powder.overflowSpills) addSpill(ctx.world, ctx.world.tileOf(player.x, player.y));
        }

        function onCharge(ctx: StationCtx, t: number): void {
            if (mg.phase !== 'mash' || mg.mashed.length !== 3) return;

            const tMashMs = boundedMs(
                mashThirdT - mashFirstT,
                (mashThirdAt - mashFirstAt) * 1000,
                tolerance(ctx.world),
            );
            const tCharge = chargeSeconds(tMashMs / 1000, heat);

            okMs = Math.round(okWindowMs(tCharge, heat));
            bandCenterMs = targetMs(tCharge, mg.bandOffset);
            chargeAt = ctx.now;
            chargeT = t;
            chargeHeldMs = 0;

            mg.phase = 'charge';
            mg.chargeStartAt = ctx.now;
            mg.tCharge = tCharge;
            mg.okMs = okMs;
            mg.heat = heatOf(tCharge, heat);

            ctx.setMg(mg);
        }

        function onRelease(ctx: StationCtx, player: PlayerState, t: number): void {
            if (mg.phase !== 'charge') return;

            const heldMs = boundedMs(
                t - chargeT,
                (ctx.now - chargeAt) * 1000,
                tolerance(ctx.world),
            );
            const errorMs = heldMs - bandCenterMs;

            resolve(ctx, player, judgeRelease(errorMs, okMs, heat.deadCenterMs), errorMs);
        }

        return {
            onJoin(ctx: StationCtx, player: PlayerState, role: Role): void {
                // Rack hands and helpers add efficiency; they do not drive the
                // plunger, and a second body must not steal the combo.
                if (role !== 'work') return;

                operatorId = ctx.sessionIdOf(player);
                player.combo = 0;
                chargeHeldMs = 0;
                mg = idleMg(heat, rollDrift(ctx.world));

                ctx.setMg(mg);
            },

            /** Every exit costs the combo — that is the price of stopping (docs/04). */
            onLeave(ctx: StationCtx, player: PlayerState): void {
                if (!isOperator(ctx, player)) return;

                if (mg.phase === 'mash' || mg.phase === 'charge') ctx.abort();

                mg.phase = 'idle';
                mg.mashed = [];
                mg.chargeStartAt = 0;
                mg.tCharge = 0;
                mg.okMs = 0;
                mg.heat = 0;
                mg.combo = 0;
                mg.tier = 0;
                mg.lastOutcome = '';
                player.combo = 0;
                operatorId = '';
                chargeHeldMs = 0;

                ctx.setMg(mg);

                if (station.st.beacon !== 'red') station.st.beacon = 'off';
            },

            /** `E` with full hands is F06's put-down; with empty hands it means leave. */
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
                if (!isOperator(ctx, player)) return;

                if (op === 'mash') {
                    const chute = chuteOf(v);

                    // The plunger is down or the hands are full: no chute lands.
                    if (chute === null || mg.phase === 'charge' || mg.phase === 'hands') return;

                    onMash(ctx, player, chute, t);

                    return;
                }

                if (op === 'charge') onCharge(ctx, t);
                if (op === 'release') onRelease(ctx, player, t);
            },

            tick(ctx: StationCtx, dt: number): void {
                const player = ctx.operators.find((p) => ctx.sessionIdOf(p) === operatorId);

                if (player === undefined) return;

                if ((mg.phase === 'idle' || mg.phase === 'mash') && player.carrying !== '') {
                    // A half-mashed cycle has to be given back, or the station
                    // stays "executing" and never takes another rep.
                    if (mg.phase === 'mash') ctx.abort();

                    mg.phase = 'hands';
                    mg.mashed = [];

                    ctx.setMg(mg);
                } else if (mg.phase === 'hands' && player.carrying === '') {
                    mg.phase = 'idle';

                    ctx.setMg(mg);
                } else if (mg.phase === 'charge' && ctx.paused) {
                    // F05 drops `mg` for the whole interrupt, so a plunger that
                    // kept climbing would be half a second the player is not
                    // allowed to release in. The anchor rides the clock instead
                    // — the Jig shifts its beats the same way — and the judge,
                    // the overhold and the drawn gauge all stay on one hold.
                    chargeAt += dt;
                    chargeT += dt * 1000;
                    mg.chargeStartAt = chargeAt;

                    ctx.setMg(mg);
                } else if (mg.phase === 'charge') {
                    // Holding forever must not be a way to dodge the miss.
                    chargeHeldMs += dt * 1000;

                    if (chargeHeldMs > bandCenterMs + okMs + heat.overholdMs) {
                        resolve(ctx, player, 'late', chargeHeldMs - bandCenterMs);
                    }
                }

                // F10 may raise red over gold at any time and clears it back to
                // 'off'; hazards tick after stations, so red always wins.
                if (station.st.beacon !== 'red') {
                    station.st.beacon = mg.tier >= 2 ? 'gold' : 'off';
                }
            },

            /** Boom Powder has no input shelf: the chutes never run dry (docs/03). */
            starved(): boolean {
                return false;
            },
        };
    },
};
