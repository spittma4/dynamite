import { HERO_POINTS_PER_EVENT, UTILIZATION_LABELS } from './constants';
import type { DayConfig, EconomyConfig, GradeThresholds, GradingConfig } from '../config/types';
import type { ItemType, Product } from '../schema/types';
import type { Grade, PlayerLabel, Pnl, Verdict } from '../report';

/**
 * The report card (docs/18). Node computes it and Laravel stores what Node
 * sends, so this is the only place a grade or a coin figure is worked out.
 */

export interface GradeInputs {
    ordersCompleted: number;
    ordersTotal: number;
    peakWip: number;
    complaints: number;
    shipped: number;
    avgCycleSeconds: number;
    incidents: number;
    cleanSweeps: number;
    niceSaves: number;
    bookDone: boolean;
    remainingSeconds: number;
    exploded: boolean;
}

export interface DayGrade {
    score: number;
    grade: Grade;
    verdict: Verdict;
    multiplier: number;
}

export interface PnlInputs {
    shipped: Partial<Record<Product, number>>;
    waste: Partial<Record<ItemType, number>>;
}

/** Worst to best, so a demotion is one step back down the list. */
const VERDICT_LADDER: readonly Verdict[] = ['DISASTER', 'ROUGH', 'FINE', 'SMOOTH', 'FLOW'];

function clamp01(v: number): number {
    return Math.min(1, Math.max(0, v));
}

export function letterFor(score: number, t: GradeThresholds): Grade {
    if (score >= t.A) return 'A';
    if (score >= t.B) return 'B';
    if (score >= t.C) return 'C';
    if (score >= t.D) return 'D';

    return 'F';
}

/** A floor buried in work in progress costs a step, however well the orders went. */
export function verdictFor(
    onTime: number,
    peakWip: number,
    grading: GradingConfig,
    exploded: boolean,
): Verdict {
    if (exploded) return 'EXPLODED';

    const { verdict, targets } = grading;
    let rung = 0;

    if (onTime >= verdict.flow) rung = 4;
    else if (onTime >= verdict.smooth) rung = 3;
    else if (onTime >= verdict.fine) rung = 2;
    else if (onTime >= verdict.rough) rung = 1;

    if (peakWip > targets.wip) rung = Math.max(0, rung - 1);

    return VERDICT_LADDER[rung] as Verdict;
}

export function gradeDay(i: GradeInputs, grading: GradingConfig, day: DayConfig): DayGrade {
    const { weights, targets, thresholds } = grading;
    const onTime = i.ordersTotal > 0 ? i.ordersCompleted / i.ordersTotal : 0;
    const wipTerm = clamp01(1 - i.peakWip / targets.wip);
    const qualityTerm = 1 - i.complaints / Math.max(1, i.shipped);
    const cycleTerm =
        i.ordersCompleted > 0 ? clamp01(1 - (i.avgCycleSeconds / targets.cycleSeconds - 1)) : 0;
    const hero = Math.min(
        weights.heroCap,
        HERO_POINTS_PER_EVENT * (i.cleanSweeps + i.niceSaves),
    );
    const early = i.bookDone
        ? Math.min(
              day.earlyFinishCap,
              day.earlyFinishBonusPerMinute * Math.floor(i.remainingSeconds / 60),
          )
        : 0;

    const raw =
        weights.onTime * onTime +
        weights.wip * wipTerm +
        weights.quality * qualityTerm +
        weights.cycle * cycleTerm +
        weights.incident * i.incidents +
        hero +
        early;

    const score = Math.max(0, Math.round(raw));
    const grade = i.exploded ? 'F' : letterFor(score, thresholds);

    return {
        score,
        grade,
        verdict: verdictFor(onTime, i.peakWip, grading, i.exploded),
        // An explosion pays nothing, whatever the paperwork says (docs/18).
        multiplier: i.exploded ? 0 : grading.multiplier[grade],
    };
}

export function profitAndLoss(i: PnlInputs, economy: EconomyConfig, multiplier: number): Pnl {
    const prices = economy.price as Record<string, number | undefined>;
    let revenue = 0;

    for (const [product, count] of Object.entries(i.shipped)) {
        const price = prices[product];

        if (price === undefined) throw new RangeError(`no price for shipped product ${product}`);

        revenue += (count ?? 0) * price;
    }

    let waste = 0;

    for (const [type, count] of Object.entries(i.waste)) {
        // Scrap with no price on it — spools and caps — costs nothing rather
        // than inviting an invented number.
        waste += (count ?? 0) * (economy.wasteCost[type as ItemType] ?? 0);
    }

    const profit = revenue - waste;

    return {
        revenue,
        waste,
        profit,
        multiplier,
        coin: Math.round(Math.max(0, profit) * multiplier),
    };
}

export function utilizationLabel(utilization: number): PlayerLabel {
    if (utilization >= UTILIZATION_LABELS.excellent) return 'EXCELLENT';
    if (utilization >= UTILIZATION_LABELS.good) return 'GOOD';

    return 'NEEDS FOCUS';
}
