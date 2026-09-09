import type { GrooveThresholds } from '@shared';

import { GROOVE } from '../nouns';
import { GROOVE_COLOURS } from '../render/palette';

/**
 * Which Groove band the bar is in (docs/05). The thresholds come from the level
 * so a designer can move a band without a rebuild; the colours and labels are
 * the client's.
 */

export type GrooveBandKey = 'onFire' | 'groove' | 'baseline' | 'churn' | 'meltdown';

export interface GrooveBandView {
    band: GrooveBandKey;
    colour: number;
    label: string;
}

const LABELS: Record<GrooveBandKey, string> = {
    onFire: 'ON FIRE',
    groove: `IN THE ${GROOVE}`,
    baseline: '',
    churn: 'THE CHURN',
    meltdown: 'MELTDOWN',
};

export function grooveBand(groove: number, thresholds: GrooveThresholds): GrooveBandView {
    const band = pick(groove, thresholds);

    return { band, colour: GROOVE_COLOURS[band], label: LABELS[band] };
}

function pick(groove: number, t: GrooveThresholds): GrooveBandKey {
    if (groove >= t.onFire) return 'onFire';
    if (groove >= t.groove) return 'groove';
    if (groove <= t.meltdown) return 'meltdown';
    if (groove <= t.churn) return 'churn';

    return 'baseline';
}
