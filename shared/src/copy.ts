import copyJson from '../../config/game/copy.json';

/**
 * Every joke line the game shows. `config/game/copy.json` is the single source
 * of the text (contracts §8); code only ever references a key. Features append
 * their own top-level section here and to the JSON; nobody edits another's.
 */

// TODO(F02): swap for `import type { Banner } from './schema/types';` and
// `export type BannerKey = Exclude<Banner, ''>;` once the schema lands.
// The union below is `FactoryState.banner` (contracts §3) minus the empty string.
export type BannerKey =
    | 'WHOOPS'
    | 'INCIDENT'
    | 'EXPLODED'
    | 'NICE SAVE'
    | 'CLEAN SWEEP'
    | 'HOT STREAK'
    | 'TAILGATE';

// TODO(F10): swap for `import type { SparkCause } from './sim/hazards';`
// (contracts §1 — copy ships in wave 1, so the union is local until F10 arrives).
type SparkCause = 'slammerRedline' | 'jammed' | 'fizzle' | 'crimpOnDented';

// TODO(F02): swap for `Pick<LevelConfig, 'copy'>` from './config/types' once it
// exists. A `LevelConfig` satisfies this shape structurally, so the callers in
// wave 2 need no change.
interface LevelClipboardOverride {
    copy?: { clipboard: string[] };
}

export interface Copy {
    clipboard: string[];
    chores: { unjam: string; sweep: string; stomp: string; repair: string };
    bubbles: { whatCanIDo: string; whoThrewThat: string; sawTheHighway: string };
    stations: { needHands: string; needParts: string };
    emotes: { stop: string; help: string; go: string; what: string };
    banners: Record<BannerKey, string>;
    hazards: { sparks: Record<SparkCause, string> };
    report: {
        individualHeading: string;
        factoryHeading: string;
        topPerformer: string;
        materials: string;
        certificate: string;
        repeatDay: string;
        fireMarshal: string;
        loss: string;
        sandbox: string;
    };
    events: Record<string, string>;
    standupBubbles: string[];
}

export const copy: Copy = copyJson;

/**
 * A level may ship its own clipboard lines; an absent or empty list means it
 * gets the global ones, so a station always has a line to draw.
 */
export function clipboardLines(level: LevelClipboardOverride): string[] {
    const own = level.copy?.clipboard;

    return own !== undefined && own.length > 0 ? own : copy.clipboard;
}

/**
 * A placeholder we have no value for is left as written, so a typo shows up on
 * screen instead of silently blanking the line.
 */
export function fill(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
        const value = vars[key];

        return value === undefined ? placeholder : String(value);
    });
}
