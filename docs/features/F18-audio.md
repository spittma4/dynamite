# F18 — Audio: the channel three timing games were built without
**Status:** [ ] Design reviewed · [x] Implemented (F18a, F18b and F18c's client half done) · [x] Unit tests green · [ ] Verified in the running app
**Owns:** `resources/js/game/audio/Audio.ts` · `resources/js/game/audio/cues.ts` · `resources/js/game/audio/tracks.ts` · `resources/js/game/__tests__/Audio.test.ts` · `resources/js/game/__tests__/cues.test.ts` · `resources/js/game/__tests__/tracks.test.ts`
**Touches** (a handful of lines each, in another owner's file — contracts §1, §12): `resources/js/game/main.ts` (the `unlockOnGesture` line and the three key handlers, F04) · `resources/js/game/input/Keys.ts` (**three**: the `M`, `[` and `]` bindings, F04) · `resources/js/game/ui/helpContent.ts` (the sound row, and the dock and crimp rows re-led on the visual, F04) · `resources/js/game/ui/Hud.ts` (`soundReadout`, `nudgeUnmutes`, the readout and the shout strip, F04) · `resources/js/game/minigames/Jig.ts` (`jigPulses`, the beat track, the numbered clicks and the needle colour, F08) · `resources/js/game/minigames/Dock.ts` (`shoveCue`, the beep metronome, the judgement colours and the marker colour, F09) · `resources/js/game/minigames/dock/BayWall.ts` (the last-five-seconds escalation, F09) · `resources/js/game/minigames/Slammer.ts` (`mashCue`/`slammerPulses`/`releaseCue`/`slamSound`/`chuteColour`/the gold sights, F07) · `resources/js/game/fx/Fx.ts` (`FxSpec.sound`, F04) · `resources/js/game/render/Items.ts` (`handCue` — pick up, put down, catch, F06) · `resources/js/game/render/Avatars.ts` (`newShout`, F04) · `resources/js/game/hazards/FuseFx.ts` (the hiss, F10) · `resources/js/game/hazards/DangerBeacon.ts` (the alarm burst and the gold crossing, F10)
**Reads:** `docs/features/00-contracts.md` (v2.1 — binding; §6 client mount, §7 mini-game ops) · `docs/features/{F07,F08,F09,F13,F16}` · `.ai/rules/{dynamite,client}.md` · `shared/src/sim/{jig,dock,slammer}.ts`

## Goal

**`grep -rniE "audiocontext|oscillator|\.wav|\.ogg|this\.sound" resources/js/` returns nothing, and three
of the mini-games are judged in milliseconds.** That is the whole ticket. It is not a polish item, because
the three games in question are not games you *watch* — they are games you *play by ear*, and we shipped
the timing and left out the channel it normally arrives on.

The crimp is the sharpest case and worth doing the arithmetic on. `enterCrimp` (`shared/src/sim/jig.ts:781`)
puts the three ratchet clicks at `lastKnotAt + 0.4 + i × 0.4`, and the tap is judged against the **third**
one at ±180 ms. `drawCrimp` (`minigames/Jig.ts:1167`) draws all three lines statically, the last one 3 px
and white, with a needle sweeping across them. So a player is asked to count three visual events at 2.5 Hz
and strike on the third. Nobody counts a rhythm with their eyes. They count it with their ears, and there
is nothing to hear.

**The grid is already there, and it is the factory's own tempo.** `knotTimes` (`jig.ts:237`) puts the knots
at `startAt + i × secondsPerKnot`, `secondsPerKnot` is `0.4` in every shipped level, `bpm` is `150` in every
shipped level, and `60 / 150 = 0.4`. The crimp's `leadSeconds` and `clickSeconds` are `0.4` as well. So a
long-fuse phrase is **six pulses on one unbroken 150 bpm grid** — three knots, a lead beat, then clicks one,
two and three — and the tap lands on the sixth. Sonify the knots and the clicks with the same tick and the
crimp stops being a counting exercise and becomes the thing every rhythm game is: you feel the beat for five
pulses and hit the sixth. No sim change, no window change. We are adding the channel, not the timing.

The Dock is the bluntest case. F09's copy says `SPACE shove on the beep` (`Dock.ts:37`), the design doc says
"reversing alarm beeping once a second" (F09:9), and `beepPhase` drives a marker across a row and strobes a
bay light. There is no beep. The overlay is currently a *drawing* of a beep, and the legend it prints is
false.

The Slammer is the subtlest and gets the most out of the fix. Release inside a moving band, with a gold
`deadCenterMs` hairline at the middle. The band's position is known the instant the charge starts —
`targetMs(tCharge, bandOffset)` (`slammer.ts:82`) with `mg.okMs` either side — so the three moments that
matter can be scheduled ahead as three ticks: *tick* at the band's leading edge, *TOCK* on the gold,
*tick* at the trailing edge. That converts an eye-tracking task into a "release on the TOCK" task, which is
what the gold hairline was always trying to say.

**Every cue is a second channel, never the only one.** The player who mutes the tab, or who cannot hear it,
loses nothing they cannot get another way — that is a design constraint with a test behind it, not a
promise. Each row of the cue table carries the name of the thing already on screen that says the same fact,
`cues.test.ts` asserts every cue has one, and where the visual counterpart did not exist the counterpart is
the work, not the sound.

## Ownership — F13, F07 and F16, settled

Three feature docs already have a claim on some of this, none of them has shipped a line of it, and they
disagree. Settling that is a precondition for writing the file, so it goes before Scope.

**F18 owns the engine. Nothing else may create an `AudioContext`.** One context, one master gain, one
vocabulary, one mute. A second context is a second autoplay-unlock problem, a second volume that ignores the
first, and two sounds that cannot be balanced against each other.

**What F18 supersedes in F07.** F07 owns `resources/js/game/minigames/slammerAudio.ts`
(F07:3, :67, :197, :424) with `{ unlock(), thunk(combo, size), pfft(), clink(), slop() }`, its own
`AudioContext` created on the first key press, and its task box at F07:610 is unticked — **the file was
never written**. F18 replaces it: the four sounds become four rows of F18's cue table (§Cue table), `unlock()`
becomes F18's global unlock on the first gesture, and F07's call sites change from `slammerAudio.thunk(combo, size)`
to `gameAudio.play('thunk', slamGain(size))`. `slammerAudio.ts` is deleted from F07's *Owns* line and its
task box is struck through. F07's sound *design* survives intact and is honoured to the frequency
(`thunk` 90 → 45 Hz, `clink` 1200 Hz, `slop` 200 → 80 Hz); only the plumbing moves. The one downgrade is
`pfft`, specified as band-passed noise: a noise buffer plus a filter node is a second and a third primitive
for one sound, so it becomes a short sawtooth buzz. Named here so it is a decision and not a silent loss.

**What F18 leaves to F13.** F13 owns the settings **menu** — `ui/SettingsPanel.ts`, `ui/settingsStore.ts`,
the row with the slider on it, and `PlayerSettings` as a whole. F18 does not write any of those files and
does not draw a settings panel. What F18 needs *now* is the value, because a game that makes noise without a
mute is worse than a silent one, and F13 has not been built. So F18 reads and writes the two fields it owns
— `volume` and `muted` — out of **F13's storage key and F13's JSON object** (`dynamite.settings`), through a
merge that preserves every key it does not recognise. Its reader and writer are **private to `Audio.ts`** and
exported to nothing, precisely so that F13's arrival is a deletion rather than a migration: `settingsStore`
becomes the reader, the two private functions go, and nothing else in F18 moves, because the engine already
takes the value through one setter. That is the "absorbed without a rewrite" test, and it is why the storage
seam is F13's shape (a `StorageLike` injected through `createAudio`) rather than a nicer one.

F13:26 currently lists "music and SFX beyond F07's Slammer audio" as **Out**, and F13:205 calls
`slammerAudio.ts` "the only audio in M1". Both sentences are now wrong in the same direction, and F16 had
already noticed (F16:834, contract change 9). F18 makes it one change rather than two: F13's `volume` row
names `audio/Audio.ts` as its consumer, the Out line becomes "music, and any cue not in F18's table", and
`PlayerSettings` gains `muted`. Listed under *Contract changes required*; F13's owner's call. F13's structural
test 21 — `settingsStore` imported only by render and audio modules — passes unchanged: `audio/Audio.ts` is
an audio module and there is no path from it into `Connection.send`.

**What F18 does to F16.** F16 owns `resources/js/game/render/fumbleAudio.ts` (F16:3, :162) and specifies
"one `AudioContext`, one oscillator". It keeps the file and loses the context: `fumbleAudio.ts` becomes a
*caller*, deciding **which** player is in which band and **how loud** they are from here (its distance
attenuation is genuinely F16's, and F18 has no business knowing where avatars are), and calling
`gameAudio.play('warn')` / `gameAudio.play('alarm', distanceGain)`. F18 provides the two cues F16 specified
at F16's own frequencies — a 660 Hz blip on the crossing into `wobble`, an 880 Hz tick for the 4 Hz critical
pulse — so F16d needs no new cue and no new decision. F16's contract change 9 is withdrawn in favour of
F18's; F16's "droppable if F13 declines" caveat goes away, because the `volume` consumer is now F18 either way.

## Scope

**In (M1):**
- `audio/Audio.ts`: one lazily-created `AudioContext`, unlocked on the first real user gesture; a master
  gain; `play` / `afterMs` / `at`; volume, mute and their persistence; a no-op fallback when the browser has
  no `AudioContext` at all.
- `audio/cues.ts`: pure. The cue table, the envelope maths, the settings coercion, and the clock bridge that
  turns a `FactoryState.clock` second into an `AudioContext.currentTime` second — everything a test can
  assert without a browser.
- `audio/tracks.ts`: pure enough to test without a browser. `PulseTrack` books a finite phrase's pulses one
  by one as each comes inside the horizon; `Metronome` books a repeating cue one pulse at a time. Neither
  knows which clock it is counting — that is the caller's, and it differs by game on purpose.
- Four synth voices and seventeen cues (§Cue table), every one enveloped, every one with a named visual
  counterpart, every one with a caller.
- A mute (`M`) and a volume control (`[` / `]`), persisted per viewer in `localStorage` inside `try`/`catch`,
  defaulting to on at `0.7`.
- The three timing games: the Jig's six-pulse phrase and its numbered ratchet clicks, the Dock's beep and its
  shove verdicts, the Slammer's count-in and its tick / TOCK / tick across the band.
- The floor, sparingly: a pick-up, a put-down, a catch, the hiss of a lit fuse and the DANGER beacon.

**Out (later milestones, or another feature's):**
- **Music, layers, and the brass sting.** M2 (doc 14), as F07 already says. F18 is cues only.
- **The settings panel row.** F13's, above. F18 ships a keybinding and a HUD readout, not a UI.
- **Any asset file.** No `.wav`, no `.mp3`, no sample, no audio library, no CDN. Everything is synthesised
  from oscillators and gain envelopes in code, which is also why the whole feature costs zero bytes of
  download and cannot fail to load.
- **A cue per emote kind.** A shout gets one cue (`shout`, a rising octave); *which* shout it was is carried
  by the word, on the avatar's bubble and mirrored into the HUD strip. Four cues nobody could tell apart
  would be four cues, not four facts.
- **Positional / stereo audio.** A `PannerNode` per avatar is a node graph that scales with the crew, and
  the one distance judgement anyone needs (F16's) is a scalar the caller already computes. `play` takes a
  gain multiplier; that is the whole spatial model.
- **A noise source.** See `pfft`, above.
- **Ducking, and any per-cue mixing.** There is no side-chain and no priority scaling; the balance is the peaks in the table, ranked by urgency. **A limiter is now In**, and this line used to say otherwise: `DangerBeaconView` fires one `warn` per pole crossing into gold, inside a loop over every pole, so a shift change that pushes six stations to gold together sums six voices at one `currentTime` — 1.68 before the master gain, ~1.18 on the destination, which clips and reads as a crackle rather than as an alarm. One `DynamicsCompressorNode`, made once in `unlock()`, no per-cue cost and no asset. `AudioOut.createDynamicsCompressor` is optional so a fake need not grow one and an engine without one still plays.
- **Sonifying the Slammer's continuous heat climb** (a tone whose pitch tracks the needle). It is the
  obvious idea and it is wrong twice: it wants an oscillator alive across the whole charge, which is the one
  thing §Cheap forbids, and a continuously rising pitch is *harder* to release accurately against than three
  discrete ticks. Revisit only if the playtest says the ticks did not land.
- ~~**Reacting to `fx` messages generically**~~ — **reversed in review, with both objections answered.** The
  `fx` bus is the only channel that carries a floor-wide event to *every* player, and it made no sound at
  all: the game had a cue for lifting a keg off a shelf and none for `blast`, the loss condition on levels
  2–4, whose only tell is a camera shake and a white flash that a player inside a mini-game overlay may be
  looking straight past. `FxSpec` gains an optional `sound`, and the two reasons this was Out become the two
  rules it is built to:
  - *A sound belongs to the moment, not to the effect.* So only the kinds whose moment has no cue anywhere
    else carry one — `blast` → `boom`, `whump` → `save`, `horn`, `chime`, `bonk`, `fizzle` → `pfft`,
    `snap` → `perfect`, `slam` → `thunk`. `thunk`, `clink`, `pfft` and `slop` stay **silent** in the table
    because the Slammer and the item layer already sound them at the press, and a second cue here would be
    the same keg heard twice; `spark` and `fuse` stay silent because the hiss is their channel and it runs
    for the whole fuse. `Fx.test.ts` asserts both halves of that split.
  - *`Fx.override` is global-per-kind with no fall-through.* So the cue is played in `play` **before** the
    dispatch. An override replaces the drawing, never the sound — which is precisely the case `blast` is in,
    since `BlastFx` claims it.
- **Deleting `render/fumbleAudio.ts`.** It stays F16's file, above.

## Design

### Files

| Path | Responsibility |
|---|---|
| `resources/js/game/audio/cues.ts` (create) | Pure, no `AudioContext`, no DOM, no clock reads: the cue table and its types, the envelope schedule, the settings shape and its coercion, `effectiveVolume`, and `contextTimeFor`. Everything with a testable answer. |
| `resources/js/game/audio/Audio.ts` (create) | The engine. Lazy context, `unlock`, the master gain, `play`/`afterMs`/`at`, `setVolume`/`setMuted`/`toggleMute`, `readAudioSettings`/`writeAudioSettings`, and the `gameAudio` singleton the rest of the client calls. |
| `resources/js/game/audio/tracks.ts` (create) | `Pulse`, `BOOK_AHEAD_MS`, `PulseTrack`, `Metronome`, `nextPulseAt`. How a cue reaches its beat *before* it arrives; no clock reads, no context, no DOM. |
| `resources/js/game/__tests__/cues.test.ts` (create) | The table's invariants (including *every cue has a visual counterpart*), the envelope, the coercion, the clock bridge. |
| `resources/js/game/__tests__/tracks.test.ts` (create) | Booking, against a recording `GameAudio`: once and only once, in order, inside the horizon, stale pulses stepped over rather than replayed. |
| `resources/js/game/__tests__/Audio.test.ts` (create) | The engine against an injected fake context that records every call: the unlock rule, the drop-don't-queue rule **across an asynchronous `resume()`**, the gesture hook, the limiter, the no-op fallback, the master gain, the scheduling, and the storage round trip including a storage that throws. |
| `resources/js/game/__tests__/Avatars.test.ts` (create) | `newShout` and `SHOUT_EVENT`: a crew-mate's bubble announced once, never your own, never an expired one. |

`audio/` is a new directory under `resources/js/game/`, which `.ai/rules/dynamite.md` says needs approval;
it is requested in *Contract changes required* alongside its §1 and §12 rows. The alternative — dropping two
files into `render/` or `minigames/` — puts the engine inside a directory whose per-file ownership is already
split four ways, for a module that belongs to neither.

### Interfaces

```ts
// resources/js/game/audio/cues.ts

export type CueName =
    | 'tick' | 'tickAccent' | 'beep' | 'bandEdge' | 'gold' | 'leaving'
    | 'perfect' | 'ok' | 'miss'
    | 'thunk' | 'thunkBig' | 'clink' | 'dud' | 'pfft' | 'slop'
    | 'grab' | 'catch' | 'shout'
    | 'hiss' | 'warn' | 'alarm'
    | 'boom' | 'save' | 'horn' | 'chime' | 'bonk';

export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

/** One enveloped oscillator burst. A cue is one to three of these. */
export interface Voice {
    wave: Wave;
    freq: number;
    /** Glide target, reached at the end of the hold. Absent = a steady pitch. */
    toFreq?: number;
    /** Offset from the cue's own start, so a two-tone confirm is two voices. */
    atMs: number;
    attackMs: number;
    holdMs: number;
    releaseMs: number;
    /** 0–1, before volume and before the caller's gain multiplier. */
    peak: number;
}

export interface CueSpec {
    readonly voices: readonly Voice[];
    /** What this sound means. One line, in the table below. */
    readonly purpose: string;
    /** The thing already on screen that says the same fact. Never empty. */
    readonly seenAs: string;
}

export const CUES: Readonly<Record<CueName, CueSpec>>;
/** The cues whose whole information is their onset; their attack budget is asserted separately. */
export const TIMING_CUES: readonly CueName[];
export function voiceDurationMs(voice: Voice): number;
export function cueDurationMs(cue: CueName): number;

export interface EnvelopePoint { at: number; value: number; ramp: 'set' | 'linear' | 'exp' }
export function envelope(voice: Voice, startSec: number, level: number): EnvelopePoint[];
export const MIN_GAIN: number;   // 0.0001 — exponential ramps cannot reach 0

export interface AudioSettings { volume: number; muted: boolean }
export const DEFAULT_AUDIO_SETTINGS: AudioSettings;   // { volume: 0.7, muted: false }
export const SETTINGS_KEY: string;                    // 'dynamite.settings' — F13's key
export function coerceAudioSettings(raw: unknown): AudioSettings;
export function mergeAudioSettings(raw: unknown, next: AudioSettings): Record<string, unknown>;
export function effectiveVolume(s: AudioSettings): number;
export function stepVolume(v: number, delta: number): number;   // clamped, rounded to a 0.05 grid

/** null = too late to be worth playing. See §The clock bridge. */
export function contextTimeFor(deltaMs: number, ctxNow: number): number | null;
export const MAX_LATE_MS: number;      // 25
export const MAX_SCHEDULE_AHEAD_MS: number;  // 1500
```

```ts
// resources/js/game/audio/Audio.ts

export interface GameAudio {
    /**
     * False once we know this browser cannot play — only knowable after
     * `unlock()` has tried to build a context. No caller needs to read it:
     * every method is already a silent no-op when it is false.
     */
    readonly available: boolean;
    readonly unlocked: boolean;
    settings(): AudioSettings;
    setVolume(v: number): void;
    setMuted(muted: boolean): void;
    toggleMute(): boolean;
    nudgeVolume(delta: number): number;
    /** Call from a real user gesture. Idempotent; creates the context on the first call. */
    unlock(): void;
    /** Now. `gain` is the caller's own multiplier (F16's distance). Returns whether it sounded. */
    play(cue: CueName, gain?: number): boolean;
    /** `deltaMs` from now, on the same clock the caller measured it against. */
    afterMs(cue: CueName, deltaMs: number, gain?: number): boolean;
    /** A `FactoryState.clock` second, against the caller's own `serverNow`. */
    at(cue: CueName, atSeconds: number, serverNow: number, gain?: number): boolean;
}

export interface AudioDeps {
    context?: () => AudioOut | null;
    storage?: StorageLike | null;
}

export function createAudio(deps?: AudioDeps): GameAudio;
export const gameAudio: GameAudio;

/** `window`'s two methods, so a test never needs a DOM. */
export interface GestureTarget {
    addEventListener(type: string, listener: () => void, options?: { passive?: boolean }): void;
    removeEventListener(type: string, listener: () => void): void;
}

/**
 * The line that makes every other line in F18 audible. Binds `pointerdown` and
 * `keydown`, stays attached (`unlock()` is idempotent, and a tab-blur suspend
 * needs the next press), and returns a detach.
 */
export function unlockOnGesture(target: GestureTarget, audio?: GameAudio): () => void;
```

`AudioOut`, `NodeOut`, `OscOut`, `GainOut`, `ParamOut` and `StorageLike` are narrow structural interfaces
over the slice of WebAudio and of `localStorage` that F18 uses — a real `AudioContext` satisfies them, and
so does a recording fake, with no `as unknown as` anywhere in the tests. That is the point of them: the
engine is testable because the seam is a parameter, not because the tests are clever. And the default
factories **return** those types rather than asserting them, so `tsc` is what checks that the interfaces
still describe the real APIs; an interface nothing is ever assigned to can quietly stop being true.

There is no `destroy()`. Nothing in the client has a reason to tear the engine down — the page going away
takes the context with it — and an unused lifecycle method is a method somebody later has to decide whether
to call.

### Cue table

Twenty-five cues over four voice shapes. Every row's last column is a design constraint with `cues.test.ts`
behind it: **no cue is the only channel its fact arrives on.** Every row also has a caller, which is the
other standing rule — an uncalled cue is dead data and is deleted, not kept for later.

Two more invariants were added in review, each with a test:

**One fundamental each.** `beep` and the first voice of `perfect` were both 880 Hz triangle. At the dock the
`Metronome('beep')` fires once a second for the whole 20 s dwell and `shoveCue` returns `perfect` on every
P-lamp shove — so the confirmation that you nailed the beep *began as another beep* and was literally
indistinguishable from one for 70 ms, at the one station where both fire constantly. `alarm` shared that
pitch too while meaning "the factory is about to explode", and `bandEdge` (square 740) shared `ok`'s
(triangle 740) inside the same Slammer second. `beep` drops to 700 so the reversing alarm sits *below* every
confirmation, `perfect` rises to 990 → 1320, `bandEdge` moves to 620, and no two rows share a first-voice
pitch any more.

**Peaks rank by urgency, not by physical loudness.** `thunk` at 0.6 was the loudest cue in the table by a
factor of 2.7, and it is somebody else's routine success — fired for every viewer, deliberately — while
`hiss` at 0.12 is a six-second countdown to an explosion and `bandEdge` at 0.14 is a judged timing edge. A
jig operator on level 2 with a red beacon and a lit fuse can have seven streams running, three of them
periodic at incommensurate rates. The hazard and timing cues now sit above the routine ones, and only the
blast is allowed above them.

| Cue | Shape | Sound | Fires when | Also on screen as |
|---|---|---|---|---|
| `tick` | click | 1100 Hz square, 25 ms | a beat on the grid that is **not** the one you act on: each pour beat, every knot, ratchet clicks 1–2, chutes 1–2 | the beat marks, knot markers and click lines the panels already draw, plus the sweeping needle |
| `tickAccent` | click | 1650 Hz square, 35 ms, louder | the beat you **act** on: the crimp's third click, the pour mark, the third chute that arms the plunger | the numbered third click line, lit as the needle reaches it; the pour's mark line; the plunger bar going green |
| `beep` | blip | 700 Hz triangle, 110 ms | each dock beep while a truck is docked | the cyan marker crossing the centre line of the beep row, and the bay light strobe |
| `bandEdge` | click | 620 Hz square, 20 ms | the Slammer needle crossing **into** the OK band. There is no closing tick — see `slammerPulses` | the amber band drawn on the gauge, with the needle entering it |
| `gold` | click | 1480 Hz square, 30 ms | the needle crossing the gold hairline | the gold hairline, its strip, and the two sights bracketing it above and below the track |
| `leaving` | two-tone | 466 → 349 Hz square | each of a docked truck's last five seconds | the bay-wall countdown flashing amber through its last five seconds |
| `perfect` | confirm | 990 Hz then 1320 Hz triangle | a Perfect judgement: a jig press, a gold release, a `P` on the truck's slot lamps, a perfect throw landing | the jig's gold pop, the Slammer's gold badge, the dock's THUD and its `P` lamp |
| `ok` | blip | 740 Hz triangle, 80 ms | an OK judgement: a jig press, a band release, an `O` lamp | the green pop, the Slammer's green badge, the dock's *scrape* and its `O` lamp |
| `miss` | buzz | 160 Hz sawtooth, 180 ms | a miss, a stall, or a refused press | the red pop with its `EARLY −n` / `LATE +n` readout, and the lane chip turning red on `STALLED` |
| `thunk` | blip | sine 90 → 45 Hz | an ordinary keg landing in the hopper; the tailgate slamming (F07's `thunk`) | hopper squash, camera shake, confetti, the combo counter ticking |
| `thunkBig` | blip | sine 70 → 32 Hz | a **prime** keg landing | the bigger shake, the doubled confetti, the brass flag and the gold verdict badge |
| `clink` | blip | 1200 Hz sine, 60 ms | an item leaves your hands onto a shelf or the floor. **Nothing else** | the item dropping out of the carry position, and `FX_SPECS.clink` |
| `dud` | blip | sine 420 → 180 Hz | an **early** release — the plunger let go before the band | the `EARLY` verdict with its millisecond readout, and `FX_SPECS.clink` at the hopper |
| `pfft` | buzz | 220 Hz sawtooth, 150 ms | a late release, a damp keg, a `fizzle` (F07's `pfft`) | `FX_SPECS.pfft` — the drifting puff and the word *pfft* |
| `slop` | blip | sine 200 → 80 Hz | a fourth or a repeated chute — the overflow (F07's `slop`) | the refused chute square flashing red under the key, `FX_SPECS.slop`, and the spill on the floor |
| `grab` | blip | 320 Hz triangle, 45 ms | something comes off a shelf, a tray or the floor into your hands | the item lifting to ride 20 px above your avatar |
| `catch` | blip | triangle 500 → 1000 Hz | a thrown item lands in **your** hands | the arc ending on your avatar, plus the server's `PERFECT` or `clink` at the landing |
| `shout` | confirm | 587 then 1175 Hz triangle | a **crew-mate** shouts (never your own) | the bubble over their avatar, and the same word in the HUD toast strip |
| `hiss` | buzz | sawtooth 2400 → 1800 Hz | one pulse of a lit fuse: 2 Hz, doubling to 4 Hz inside the last two seconds | the sparkle on the keg, its shortening cord, and the amber turning orange |
| `warn` | blip | 660 Hz triangle, 90 ms | a station's beacon crossing into `gold`; and (F16) a fumble meter entering `wobble` | the gold lamp on the pole, and F16's amber shaking gauge |
| `alarm` | click | 880 Hz square, 30 ms | the crossing into red DANGER — **three pulses, then quiet**; and (F16) the 4 Hz critical tick | the pulsing red lamp and the hazard stripes, both of which outlast the sound |
| `boom` | two-voice | sine 150 → 38 Hz under a 55 Hz sawtooth | the blast | `BlastFx`'s white flash and ring, the camera shake, and the soot on everyone it caught |
| `save` | chord | 520 + 780 Hz triangle | a keg smothered in the sand bin | `FX_SPECS.whump` — the sand ring — and the fuse sparkle going out |
| `horn` | two-tone | 392 then 330 Hz triangle | the truck pulling out | `FX_SPECS.horn` — the word *HONK* — and the truck sliding out of the door |
| `chime` | two-tone | 1568 then 2093 Hz sine | an order filled, or a station back from damage | `FX_SPECS.chime` — the brass flash — and the order leaving the `Tab` board |
| `bonk` | click | 260 Hz square, 80 ms | the floor refusing an action: a full shelf, the wrong fuse, a busy machine | `FX_SPECS.bonk` — *bonk*, `FULL`, `WRONG FUSE` or `BUSY`, where the press was refused |

The four shapes are one primitive wearing four sets of numbers, which is the reason there is no `Voice`
subclass anywhere: **click** is a very short square burst with a ~1 ms attack; **blip** is a longer
triangle or sine, optionally gliding; **confirm** is two blips, the second offset by `atMs`; **buzz** is a
sawtooth with a long release. A **chord** is two blips at `atMs: 0`. The engine reads `voices`, not a shape
name.

#### Two cues that were one

`clink` carried two unrelated meanings and the table said so out loud: "an item leaving your hands onto a
shelf **and an early keg**". "You put something down" and "you released the plunger early and made a dud"
are different lessons needing different corrections, and they sounded identical. The early release is `dud`
now — a short descending sine, which sits next to `pfft` for late.

`thunk` distinguished a prime keg from an ordinary one **by gain alone**, 1.0 against 0.65, which is the
first distinction a room with two other people shouting destroys. It is `thunkBig` now, 70 → 32 Hz under
`thunk`'s 90 → 45: deeper, not louder.

### Behaviour

#### 1. The unlock, and why it gets its own acceptance criterion

An `AudioContext` constructed before a user gesture starts in state `suspended`, and every `start()` on it is
**silently dropped** — no exception, no console warning, and `oscillator.start()` returns `undefined` either
way. It is the single classic bug in browser audio and it is invisible in code review, so it is handled
structurally rather than by care:

1. `createAudio` **does not** create a context. The constructor touches nothing.
2. `unlock()` — called from a real gesture — creates the context on its first call and calls `resume()`. It is
   idempotent: a second call creates no second context and issues no second `resume`.

   The caller is `unlockOnGesture(window, gameAudio)`, one line in `main.ts` after the Phaser game is
   constructed. It is **a function in `Audio.ts` with a test**, not three lines buried in an entry point,
   because without a caller the whole feature is inert and the failure is completely silent: every cue
   returns `false`, no node is created, nothing throws and nothing logs. The listeners stay attached rather
   than firing once — `unlock()` is idempotent, so the cost is one `state === 'running'` check per press and
   the benefit is that a context the browser suspends on a tab blur comes back on the next key the player
   touches, with nothing else in the client having to notice.
3. Before the first `unlock()`, `play` / `afterMs` / `at` return `false` immediately. They **do not** throw,
   and — the part that matters — they **do not queue**. A cue requested at second 3 of a shift is a fact
   about second 3; replaying it at second 12 when the player finally presses a key would fire a burst of
   stale beeps against a factory that has moved on, and for a *rhythm* cue a late beep is worse than no beep.
4. If the context later returns to `suspended` on its own (a backgrounded tab), the same rule applies: the
   cue is dropped, and the next `unlock()` — or the next gesture — resumes it.
5. **`resume()` is asynchronous, and the drop applies across that gap too.** On iOS Safari, and on Chrome
   when the context was built outside the gesture, `ctx.state` stays `'suspended'` until the promise settles
   one or more tasks later; `Engine.resume()` is deliberately fire-and-forget, so every cue between the
   unlocking gesture and the resume settling is dropped. That is the policy, not an accident — a burst of
   stale beeps arriving when the resume lands is worse than a handful of cues lost — and it is pinned by a
   `SlowFakeContext` in `Audio.test.ts` whose `resume()` flips `state` only on `await Promise.resolve()`. A
   fake that resumes synchronously passes the same tests and hides the exact failure this section is about.

The gesture that unlocks is the same gesture that does something else, so there is no "click to enable
sound" screen and nothing to explain.

#### 2. The clock bridge, and why not `setTimeout`

A cue scheduled with `setTimeout` drifts against the bar the player is watching: the timer is throttled,
rounded, and measured against a wall clock the mini-game does not draw from. Every cue is scheduled instead
on the **`AudioContext`'s own sample clock**, which is what makes it sample-accurate, through one conversion:

```
contextTimeFor(deltaMs, ctxNow) = ctxNow + deltaMs / 1000
```

with two guards, both of which are the reason it is a pure function with tests rather than an expression:

- `deltaMs < −MAX_LATE_MS` → **`null`**, the cue is dropped. WebAudio treats a `start()` time in the past as
  "now", so a stale cue does not fail — it fires *late*, which for a beat marker is the failure mode this
  whole feature exists to avoid. A small negative delta (within 25 ms, a frame) is clamped to `ctxNow` and
  played, because a beat one frame late still reads as on the beat.
- `deltaMs > MAX_SCHEDULE_AHEAD_MS` → **`null`**. `ServerClock.now()` extrapolates between patches and is
  capped at 250 ms of extrapolation (`CLOCK_EXTRAPOLATE_MAX_S`), so a cue booked 6 s out is booked against a
  clock estimate that will have been re-based several times before it fires. 1.5 s is comfortably longer than
  any of the three schedule-ahead sites needs and short enough that the estimate is still the estimate.

The caller supplies the delta against **the clock it draws from**, which is not the same clock in all three
games and must not be:

- **The Jig** draws off `ctx.serverClock()` and `mg.knotAt` / `mg.crimpClickAt` are `FactoryState.clock`
  seconds, so it calls `at(cue, knotTime, serverNow)`. The times arrive once, when `station.mg` changes
  (`Jig.ts:631`), which is also the only place the cues are booked — no per-frame work at all.
- **The Dock** draws off `beepPhase(mg.beepAt, mg.beepPeriodMs, serverNow)`, so it books the next beep the
  same way, one beep at a time.
- **The Slammer** is the exception and the contracts say why: it "judges only press-to-press intervals
  measured on the same client clock" (§7), and the overlay's needle runs off `needleStartLocal =
  performance.now()`, not the server clock. So its three band ticks are booked with `afterMs`, against the
  same local base the needle uses. Booking them off the server clock would put the TOCK somewhere other than
  where the player can see the needle is, which is the precise failure this rule exists to prevent.

`at(cue, atSeconds, serverNow)` is `afterMs(cue, (atSeconds − serverNow) × 1000)`. One primitive, one
convenience, and the seconds-versus-milliseconds conversion happens in exactly one place. It takes two
readings of *one* clock — whichever the caller draws from — so the Slammer passes `performance.now() / 1000`
and the other two pass `FactoryState.clock` seconds, through the same function.

#### 2a. Booking: a cursor, not a poll

A phrase is longer than the horizon. The pour is up to eight beats at 0.4 s — 3.2 s — and the Slammer's
trailing band edge can be 1.9 s out on a lazy charge, so a design that booked the whole phrase once, when
`station.mg` changed, would simply lose every pulse past 1.5 s. That is the wrong failure for the pour and
the **right** failure for nothing, so booking is a cursor instead:

- `PulseTrack.aim(pulses)` points at a phrase. Re-aiming at the same array is a no-op, so the caller hands it
  the phrase every frame and only a genuinely new phrase rewinds the cursor. The arrays themselves are rebuilt
  only when the phrase identity changes (`phraseKey` for the Jig, the `charge` transition for the Slammer),
  which is what keeps the steady state allocation-free.
- `PulseTrack.book(now, audio)` steps the cursor over every pulse now inside `BOOK_AHEAD_MS` (1200, inside the
  engine's own 1500) and stops at the first one beyond it. Once caught up it is a single comparison per frame.
  A pulse the engine refuses as stale is stepped over, never retried — that rule lives in one place and has a
  test.
- `Metronome` is the same idea for a cue with no end: the dock beep, the fuse hiss, the beacon. It books one
  pulse at a time off a grid origin rather than off the moment the state became true, so a player who walks up
  to an emergency already in progress hears it in step with the lamp they can see.

Nothing fires on a frame timer. The frame loop decides *when to book*; the `AudioContext` decides when to
sound, which is the whole difference between a beat and a beat-shaped thing that arrives a frame late.

#### 3. Envelopes, or why a raw oscillator sounds broken

`osc.start(t); osc.stop(t + d)` on a gain of 1 produces an audible click at both ends — the waveform is
discontinuous at the boundary — and the result does not read as a short sound, it reads as a broken one. So
every voice, without exception, is enveloped:

```
gain.setValueAtTime(MIN_GAIN, t0)
gain.linearRampToValueAtTime(peak × level, t0 + attack)     // attack: 1–8 ms
gain.setValueAtTime(peak × level, t0 + attack + hold)       // hold: the body
gain.exponentialRampToValueAtTime(MIN_GAIN, t0 + attack + hold + release)
gain.setValueAtTime(0, t0 + attack + hold + release)
osc.start(t0); osc.stop(t0 + attack + hold + release)
```

`MIN_GAIN` is `0.0001` and not `0` because `exponentialRampToValueAtTime(0, …)` throws a `RangeError` in
every engine — an exponential curve cannot reach zero. The trailing `setValueAtTime(0, …)` is what actually
silences it. `envelope()` returns that schedule as data, so a test asserts the shape without a browser and
without any of it being reachable only through a real context.

Attack is 1 ms for every *timing* cue (`tick`, `tickAccent`, `beep`, `bandEdge`, `gold`, `alarm`) and
`cues.test.ts` asserts that: a slow attack smears the onset, and the onset **is** the information. A cue
whose attack is 20 ms is a cue that arrives 20 ms late for a game judged at ±45 ms.

#### 4. Cheap

- Nothing is created per frame. Nothing is created per tick. A cue creates one oscillator and one gain
  **per voice** — so one or two nodes, one to three times a second at the busiest — starts them, stops them,
  and lets them go. `onended` disconnects the pair; a stopped, disconnected node is collected.
- The three schedule-ahead sites book their cues when `station.mg` *changes*, not on every `update()`. The
  Jig books six pulses once per phrase; the Dock books one beep per beep; the Slammer books three ticks per
  charge. The steady state is zero allocations per frame and zero work per frame.
- Volume is a single master `GainNode` set once on change, not a multiply at every call site.
- Muted returns `false` from `play` before any node is created, so a muted game allocates nothing at all.

#### 5. Volume, mute, and the shape F13 absorbs

`M` toggles mute. `[` and `]` step the volume by 0.05 within `[0, 1]`. Both write through immediately, and
both put a readout on the HUD for two seconds — `SOUND 70%` / `SOUND OFF` — which is the visual counterpart
for the audio control itself, and the only way a muted player can tell that the key did anything.

`M` does **not** repeat while held — a held mute key would flap the sound on and off at the repeat rate —
and the brackets do, because holding one is how a player actually crosses twenty steps. The policy F18c left
open: **`]` un-mutes, `[` does not.** The only reason to ask for "louder" while silent is to hear something;
asking for quieter is not, and the engine keeps `volume` and `muted` independent either way so the level
survives. It is `nudgeUnmutes` in `Hud.ts` — the surface with a readout to explain it with — rather than a
branch in the entry point, so it has a test.

Persistence is F13's key and F13's object:

- `readAudioSettings(storage?)` — `getItem('dynamite.settings')`, `JSON.parse`, `coerceAudioSettings`. Every
  step is inside `try`/`catch` and every failure returns `DEFAULT_AUDIO_SETTINGS`. `localStorage` throws on
  access in a private window and in some embedded contexts; a corrupt payload, a payload that is a string, a
  `volume` of `"loud"` and a `volume` of `NaN` all coerce rather than throw.
- `writeAudioSettings(next, storage?)` — read the raw object first, **merge** the two fields F18 owns into
  it, write it back. It never drops `reducedMotion`, `colourSafe` or `uiScale`, because F13 will be writing
  those to the same key and the last writer must not win the whole object. `mergeAudioSettings` is the pure
  half and is tested against a payload carrying F13's other three fields.

Defaults are `volume: 0.7` (F13:205's number, so F13 changes nothing when it arrives) and `muted: false` —
audio is **on** by default, at a modest level, because a mute a player has to find is a feature nobody
discovers and a volume nobody sets is a game that never makes a sound.

## Acceptance criteria

**The unlock**
- [x] `createAudio()` creates no `AudioContext` until `unlock()` is called.
- [x] A cue requested before `unlock()` returns `false`, creates no node, and throws nothing.
- [x] Five cues requested before `unlock()` produce **zero** nodes after `unlock()` — nothing is queued and nothing fires late.
- [x] `unlock()` twice creates one context and calls `resume()` once.
- [x] A cue requested while the context is `suspended` after unlock is dropped, not queued.
- [x] A cue fired in the *same tick* as the gesture, while `resume()` is still in flight, is dropped and creates no node; one fired after the resume settles sounds, and nothing it dropped is replayed.
- [x] `unlockOnGesture` binds both `pointerdown` and `keydown`, unlocks on the first of either, stays attached so a later gesture resumes a suspended context, and detaches on request.
- [x] `main.ts` calls it. **The whole feature is inert without this line and fails silently, so it is the first thing to check in a review.**

**The fallback**
- [x] With no `AudioContext` in the environment, `available` is `false`, every method is a silent no-op, and no caller anywhere in the client needs a null check.
- [x] With no `createDynamicsCompressor`, the master gain connects straight to the destination and every cue still plays.

**The sounds**
- [x] Every cue in `CUES` has at least one voice, a non-empty `purpose`, and a non-empty `seenAs`.
- [x] Every voice has a non-zero attack and a non-zero release — no cue starts or stops a bare oscillator.
- [x] Every timing cue (`tick`, `tickAccent`, `beep`, `bandEdge`, `gold`, `alarm`) has an attack of ≤ 8 ms.
- [x] No cue is longer than 400 ms, so no cue outlives the beat it marks at 150 bpm.
- [x] `envelope()` never schedules an exponential ramp to `0`, and always ends at exactly `0`.
- [x] `play('perfect')` creates two oscillators; `play('tick')` creates one.
- [x] **No two cues share a first-voice pitch.**
- [x] `hiss`, `bandEdge`, `gold` and `tickAccent` all peak above `thunk`; `hiss` peaks above `alarm`; nothing peaks above `boom`.
- [x] One `DynamicsCompressorNode` sits between the master gain and the destination, created once at the unlock and never again.

**The clock**
- [ ] `contextTimeFor` is `ctxNow + deltaMs / 1000` for a delta inside the window.
- [ ] A delta more than 25 ms in the past returns `null`; a delta 10 ms in the past clamps to `ctxNow`.
- [ ] A delta beyond 1500 ms returns `null`.
- [ ] `at(cue, s, serverNow)` and `afterMs(cue, (s − serverNow) × 1000)` schedule the same context time.

**Volume and mute**
- [ ] The default is `{ volume: 0.7, muted: false }`, and a fresh viewer hears cues without touching anything.
- [ ] `setMuted(true)` makes `play` return `false` and create no nodes; `setMuted(false)` restores the previous volume, which was never overwritten.
- [ ] `setVolume` sets the master gain once, not once per cue.
- [ ] Settings survive a reload; a storage whose `getItem` or `setItem` throws leaves the game on the defaults and audible.
- [ ] A write preserves F13's `reducedMotion`, `colourSafe` and `uiScale` in the same key.
- [x] `M`, `[` and `]` are bound, change the value, print the HUD readout, and are taught in the help panel.
- [x] `M` does not repeat while held; the brackets do.
- [x] `]` while muted un-mutes; `[` while muted does not.
- [x] `soundReadout` prints `SOUND OFF` rather than a percentage while muted.

**The booking** *(unit)*
- [x] A phrase's pulses are booked once each, in order, however many frames pass over them.
- [x] A pulse beyond the horizon is left for a later frame rather than dropped, so a phrase longer than the horizon still sounds to its last beat.
- [x] A pulse the engine refuses as stale is stepped over, never replayed on the next frame.
- [x] `Metronome` books one pulse per period, follows a period that changes under it, and starts clean after a reset.
- [x] `BOOK_AHEAD_MS` is inside `MAX_SCHEDULE_AHEAD_MS`.

**The wiring** *(unit)*
- [x] The knots, the lead and the ratchet clicks come out as six pulses on one unbroken 150 bpm grid, with the accent on the sixth.
- [x] The pour ticks every beat and accents the mark; `seat` and `parts` book nothing.
- [x] A phrase's beats are rebuilt on a new phrase and not on the `mg` change that a judged press causes.
- [x] The dock reads `perfect` off a `P` and `ok` off an `O`, calls a newly stalled lane a miss, and stays silent for a lane the leaving truck merely emptied.
- [x] The Slammer's three band pulses land on the local clock the needle runs on, at the band the server published.
- [x] A gold release confirms differently from a band release.
- [x] `handCue` tells a catch from a pick-up, and says nothing about a throw leaving your hands.
- [x] The fuse hiss keeps the sparkle's doubling at a rate an ear can count; the beacon's alarm lands on the lamp's brightest moment.
- [x] The hiss reports only on fuses that **drew a sparkle** — a hidden fuse at 1 s left does not move the floor's rate off `1 / FUSE_HISS_HZ`.
- [x] The beacon's alarm spends `ALARM_BURST` pulses on the crossing into red and then goes quiet, re-arming only on a fresh crossing.
- [x] `slammerPulses` books two pulses, and neither lands after the gold.
- [x] `slamSound` tells prime from ordinary by pitch, and an early release from an item set down.
- [x] `FxSpec.sound` is set on every floor-wide kind with no other cue and unset on the four the mini-games sound at the press; the cue fires even on an overridden kind.
- [x] `newShout` announces a crew-mate's bubble once, never your own, and never an expired one.
- [x] `bayLabel` escalates a docked truck's last `LEAVING_WARN_SECONDS` into a kind of its own, under the slam prompt.
- [x] The Dock paints Perfect gold and OK green, the way the Jig and the Slammer do, and its marker is not the colour of the line it crosses; the Jig's needle is not the colour of the mark it crosses.
- [x] `gaugeGeometry` gives the gold a sight span of at least `SIGHT_SPAN_PX`, centred on the true target, without widening the judged strip.
- [x] `chuteColour` flashes a refused chute red whether or not it was already lit.

**The gap this ticket names** *(step 3, verified in the running app)*
- [ ] The crimp's third click arrives as an accented tick at the end of a six-pulse 150 bpm phrase, and a player can hit it with their eyes shut.
- [ ] The Dock beeps once a second while a truck is docked, and the legend `SPACE shove on the beep` is true.
- [ ] The Slammer plays tick / TOCK / tick at the band's edges and dead centre, aligned with the drawn needle rather than with the server clock.
- [ ] Muting the game loses no information: every one of the fourteen facts above is still legible from the screen alone.

## Test plan

**Unit — `resources/js/game/__tests__/cues.test.ts`** (vitest, no browser, no fake needed):

- The table: "every cue has at least one voice" · "every cue names a purpose" · **"every cue names the thing you can see instead"** (the constraint-2 assertion — it iterates `CUES` so a fourteenth cue added without a visual counterpart fails) · "every voice has a non-zero attack and release" · "every timing cue attacks in 8 ms or less" · "no cue runs longer than 400 ms" · "every peak is within 0–1".
- `envelope`: "it rises from the floor to the peak over the attack" · "it holds the peak for the hold" · "it decays exponentially to the floor and then sets exactly 0" · "it never ramps exponentially to 0" · "it scales the peak by the level" · "a glide voice keeps its envelope independent of its pitch".
- `cueDurationMs`: "it is the latest voice's end, not the first's" (asserted against `perfect`, whose second voice starts after the first ends).
- `contextTimeFor`: "it adds the delta in seconds" · "it clamps a delta a frame in the past to now" · "it returns null past MAX_LATE_MS" · "it returns null past MAX_SCHEDULE_AHEAD_MS" · "it accepts a zero delta".
- `coerceAudioSettings`: "it round-trips a good payload" · "it defaults a null, a string and an array" · "it clamps a volume above 1 and below 0" · "it defaults a NaN volume" · "it defaults a non-boolean muted".
- `mergeAudioSettings`: "it keeps F13's other three fields" · "it overwrites volume and muted" · "it starts from an empty object when the raw value is not an object".
- `effectiveVolume`: "it is 0 when muted regardless of volume" · "it clamps".
- `stepVolume`: "it moves on a 0.05 grid" · "it clamps at both ends" · "it does not accumulate float error over twenty steps".

**Unit — `resources/js/game/__tests__/Audio.test.ts`** (vitest, an injected `AudioOut` fake that records every
oscillator, gain, param call, `start`, `stop` and `resume`; a `StorageLike` fake, and one that throws):

- Unlock: "it creates no context until unlock" · "a cue before unlock returns false and creates nothing" · **"five cues before unlock produce nothing after it"** · "unlock twice creates one context and resumes once" · "a cue while suspended after unlock is dropped".
- Fallback: "with no context factory every method is a no-op and available is false" · "a context factory that throws leaves the engine unavailable rather than propagating".
- Playing: "a cue creates one oscillator and one gain per voice" · "it sets the wave and the frequency from the table" · "a glide voice ramps its frequency" · "the two voices of perfect start at their own offsets" · "the oscillator is stopped at the envelope's end" · "the node pair is disconnected on ended".
- Gain: "the master gain is created once at unlock and set to the effective volume" · "setVolume sets the master gain once and creates no node" · "the caller's gain multiplier scales the cue's peak and not the master".
- Mute: "muted returns false and creates no node" · "unmuting restores the stored volume".
- Scheduling: "afterMs schedules at ctxNow + delta" · "at converts a server second against serverNow" · "a stale cue is dropped and returns false" · "a cue booked beyond the horizon is dropped".
- Storage: "it reads the defaults from an empty store" · "it round-trips through a fake store" · "a getItem that throws leaves the defaults" · "a setItem that throws does not propagate" · "a write preserves reducedMotion, colourSafe and uiScale".
- The asynchronous resume, against `SlowFakeContext`: **"it drops a cue fired in the same tick as the gesture and creates no node"** · "it plays once the resume has settled, without replaying what it dropped".
- The gesture hook: "it listens for both gestures a player can make first" · "it unlocks on the first press, so the next cue sounds" · "it stays attached so a later gesture resumes a context the browser suspended" · "it detaches both listeners when asked".
- The master bus: "it puts a limiter between the master gain and the destination" · "it connects straight to the destination on an engine with no compressor" · "it makes no second limiter however many cues play".

**Unit — the second-channel work**, in the files that own each surface:

- `Slammer.test.ts`: `slammerPulses` books two pulses and neither lands after the gold · `BAND_BOOK_AHEAD_MS` reaches the leading edge on the tightest shipped window · `slamSound` separates prime from ordinary by pitch and early from a put-down · `VERDICT_DELAY_MS` clears the hopper's body · `chuteColour` reds a refused chute lit or unlit · the gold sights span at least `SIGHT_SPAN_PX`, stay centred on the true target, never narrow a wider strip, and stay inside the gauge.
- `Hazards.test.ts`: `visibleHissPeriod` ignores a hidden fuse and keeps quiet when every fuse is hidden · `alarmPulsesLeft` spends a burst on the crossing, counts down while red, and resets on quiet.
- `Dock.test.ts`: Perfect is gold and OK is green here **and** at the Jig and the Slammer, checked through one hue predicate so the three panels cannot drift apart · the marker is not the target's colour and the Jig's needle is not the mark's · `bayLabel` escalates the last five seconds, under the slam prompt.
- `Fx.test.ts`: every floor-wide kind with no other cue has a `sound` and the four the mini-games sound at the press do not · the cue fires on an overridden kind.
- `Keys.test.ts`: `M` once per press, the brackets ±1 and repeating.
- `Hud.test.ts`: `soundReadout` and the `nudgeUnmutes` policy.
- `cues.test.ts`: no two cues share a fundamental · the urgency ranking holds.

**Wiring tests** land with steps 2 and 3, in the three overlays' own test files, against a recording
`GameAudio` fake: the Jig books six pulses on one `mg` change and none on a repeat frame; the Dock books one
beep per beep and none while `away`; the Slammer books three ticks per charge, off `performance.now()`.

**In-app verification** (Level 1, `DEV_ALLOW_NO_TICKET=1`):

1. Load the page and *do not touch anything* for ten seconds while a truck docks. Confirm silence and no
   console error. Press a key. Confirm the **next** beep sounds and that no backlog fires. This is the
   autoplay bug and it is step 1 because it is the one that hides.
2. Work a full jig phrase: confirm three knot ticks, a lead beat, two clicks and the accent, evenly spaced,
   and land the crimp on the accent without looking at the panel.
3. Stand on a ramp lane through a whole 20-beep dwell: confirm one beep a second, in step with the bay light.
4. Charge and release the Slammer four times: confirm tick / TOCK / tick and that the TOCK is under the gold
   hairline in a screenshot with the needle frozen at the release.
5. Press `M`: confirm `SOUND OFF`, silence, and that steps 2–4 are still all playable from the screen.
   Press `[` `[` `]`: confirm the readout tracks. Reload: confirm the value survived.
6. Repeat step 5 in a private window, where `localStorage` throws: confirm the game is audible on the
   defaults and the readout still moves.

## Tasks

**F18a — the engine** *(done)*
- [x] `resources/js/game/audio/cues.ts`: the table, `envelope`, `contextTimeFor`, the settings pure half.
- [x] `resources/js/game/__tests__/cues.test.ts`.
- [x] `resources/js/game/audio/Audio.ts`: the lazy context, `unlock`, the master gain, `play`/`afterMs`/`at`, the settings read/write, the `gameAudio` singleton.
- [x] `resources/js/game/__tests__/Audio.test.ts`.

**F18b — the three games and the floor** *(done)*
- [x] `resources/js/game/audio/tracks.ts` + `__tests__/tracks.test.ts`: `PulseTrack`, `Metronome`, `nextPulseAt`.
- [x] `minigames/Jig.ts`: `jigPulses` and `phraseKey` book the pour beats, the knots and the ratchet on one
      grid; `gradeCue` on a new `mg.last`; `drawCrimp` numbers the three clicks and lights each as the needle
      reaches it, which is the third click's missing visual tell.
- [x] `minigames/Dock.ts`: the beep on `beepAt`'s own grid while docked; `shoveCue` reads the verdict off the
      lane clearing and the slot lamp the truck just lit, because `mg` carries no verdict of its own.
- [x] `minigames/Slammer.ts`: `mashCue` counts the chutes in, `slammerPulses` books tick / TOCK / tick off
      `needleStart` once the server's numbers land, `releaseCue` gives the operator the verdict and
      `slamSound` gives the whole floor the hopper.
- [x] `render/Items.ts`: `handStateOf`/`handCue` — `grab`, `catch` and `clink` off the item's placement, which
      is the only thing that knows a full pair of hands came out of the air.
- [x] `hazards/FuseFx.ts`: one `hiss` for the floor at the shortest fuse's rate. `hazards/DangerBeacon.ts`:
      `warn` on a pole crossing into gold, `alarm` on the red lamp's own 1.5 Hz peak.

**F18c — the controls and the seams**
- [x] `main.ts`: `unlockOnGesture(window, gameAudio)` after the game is constructed (F04's file). **Nothing in
      F18b could be heard until this landed.**
- [x] `input/Keys.ts`: `M`, `[`, `]` (F04's file). `ui/Hud.ts`: `soundReadout`, `nudgeUnmutes` and the
      two-second readout. `ui/helpContent.ts`: the row. `]` while muted un-mutes; `[` does not.
**F18d — the review's second channel work** *(done)*
- [x] `fx/Fx.ts`: `FxSpec.sound`, played before the override dispatch; `boom`, `save`, `horn`, `chime`,
      `bonk`, `pfft` and `perfect` wired to the kinds that had nothing.
- [x] `render/Avatars.ts` + `ui/Hud.ts`: `newShout`, the `shout` cue, and the HUD mirror of a crew-mate's word.
- [x] `minigames/dock/BayWall.ts`: `leavingSoon`, the flashing countdown and the `leaving` cue.
- [x] `minigames/Slammer.ts`: the gold sights, the refused-chute flash, `VERDICT_DELAY_MS`, and the trailing
      band pulse dropped.
- [x] `minigames/Dock.ts` + `minigames/Jig.ts`: one judgement-colour language, and a needle and a marker that
      are not the colour of what they cross.
- [x] `hazards/FuseFx.ts`: `visibleHissPeriod`. `hazards/DangerBeacon.ts`: `ALARM_BURST`.

**F18e — the other owners' files** *(outstanding; none of it is in `resources/js/game/`)*
- [ ] F07: delete `slammerAudio.ts` from *Owns*, strike its task box, repoint §Audio at F18's table.
- [ ] F13: the `volume` row's consumer, the Out line, `PlayerSettings.muted` (contract change 2), **and
      `settingsStore.ts` as the single reader/writer** (contract change 2a, below).
- [ ] F16: `render/fumbleAudio.ts` calls `gameAudio`; withdraw F16's contract change 9.
- [ ] `.ai/rules/client.md:17` ("Audio is optional in M1; if added, WebAudio beeps behind a mute toggle") and
      `docs/features/README.md`'s tracker row.
- [ ] Run the six in-app steps, attach screenshots, tick the Status boxes.

## Risks & open questions

- **The horizon versus the clock.** `MAX_SCHEDULE_AHEAD_MS` is 1500 and `ServerClock` extrapolates up to
  250 ms between patches, so a pulse booked 1.2 s out can be up to a quarter-second's worth of estimate wrong
  if the connection stalls in between. §2a is the answer to the version of this that mattered — a long phrase
  losing its last beats — and what is left is bounded: the *farthest* pulse any site books is 1.2 s out, and a
  stall between booking and sounding moves it by at most the extrapolation cap. A beat 250 ms wrong is still
  wrong, and the playtest is where that shows. The fix if it does is a **shorter** horizon, not a longer one.
- **Two clocks, on purpose, and a reader who forgets that will break it.** The Jig and the Dock book on
  `FactoryState.clock`; the Slammer books on `performance.now()` because its needle does (contracts §7). The
  types cannot tell them apart — both are "seconds" — so the comment at `slammerPulses` is the only guard, and
  a future edit that "tidies" it onto the server clock will put the TOCK somewhere other than where the needle
  visibly is. That is exactly the bug this feature exists to remove, and it would pass every test here.
- **It sounds now, and none of it has been heard.** `unlockOnGesture` is wired, so the cues are no longer
  no-ops — but everything about the *tuning* (the peaks, the pitch spacing, whether seven concurrent streams
  on a busy floor are a mix or a mess) is still only reasoned about. The six in-app steps are the only thing
  that can settle it and none of them has run. This is the one unticked Status box.
- **Seventeen cues, all called, two of them shared with a feature that has not landed.** `warn` and `alarm`
  are wired to F10's gold and red beacons here, which is what retired them as dead data; F16d will be their
  second caller at its own rate. If F16d is cut, nothing in F18 changes. The standing rule still holds in the
  other direction: a cue added later without a caller and without a `seenAs` fails the suite.
- **A busy floor is a busy mix, and the first answer was wrong.** The original claim here — "the gains are
  set so the hazard cues sit under the beats" — was the wrong goal *and* false. Three of the grids are
  incommensurate (beacon 1.5 Hz, fuse 2/4 Hz, jig 2.5 Hz) and the beacon's was a **drone**: `dangerBeacon`
  returns red off a fuel *level*, and level-02 is designed so the pile grows, so on the baseline level it
  could run for minutes at more than twice `hiss`'s gain, actively corrupting the 2.5 Hz beat the jig
  operator is trying to feel — which is the faculty this feature exists to give them. Two changes: the alarm
  is an **event** (`ALARM_BURST` pulses on the crossing, then the lamp and the stripes carry the standing
  state on their own), and the peaks are re-ranked so `hiss` — a six-second countdown — outranks it. A
  limiter caps the sum. What is left is genuinely a playtest question: dropping `ok` is the first lever,
  dropping the fuse hiss to 1 Hz is the second.
- **A `[`/`]` binding on a non-US keyboard.** Phaser's `keydown-OPEN_BRACKET` is a physical-key code, so on
  an AZERTY or a German layout the two keys are not where the label says. The help row prints the label, not
  the truth. The proper answer is F13's slider; F18's keys are the stopgap that makes the mute reachable
  before it exists, and this is the cost of that. Named rather than fixed.
- **Should a judgement cue exist at all, or only the beat?** There is a real argument that `perfect`/`ok`/
  `miss` are the *less* valuable half — they tell you about a press you have already made, where the beat
  cues tell you about one you are about to make — and that three outcome sounds a second is where a
  cartoon factory starts sounding like a slot machine. They are in because a rhythm game with no
  confirmation feels unresponsive, and the doctrine's Tier D rule ("no combo, no confetti, **no sound
  reward**", `docs/01-design-doctrine.md:27`) is a constraint on *chores*, not on judged presses. But the
  first thing to try if the playtest says it is noisy is dropping `ok` and keeping only `perfect` and `miss`.
- **The Slammer's gold is the one judgement whose visual is not honestly equivalent, and the sights are a
  partial answer.** On the shipped 538 px panel the scale is 0.229 px/ms, so the judged ±50 ms gold strip is
  **23 px** and a 3 px needle moving 3.8 px a frame is inside it for under six frames — against the crimp's
  87 px (±80 ms, ~10 frames) and the dock's 121 px (±70 ms, ~9 frames), both of which a player can genuinely
  hit by eye. Net, before this change: a deaf player could make ordinary kegs everywhere and could not
  reliably make prime kegs. The fix is two gold **sights**, `SIGHT_SPAN_PX` apart, drawn *outside* the track:
  the eye gets a stable pair of marks to aim between, and the strip and the hairline keep their true widths.
  Widening the strip itself was the other option and is rejected — it would be a claim about the window the
  server does not honour, and a player aiming at its edge would get `prime`, not `dead_center`. Whether 40 px
  of sight closes the gap is a playtest question; if it does not, the next thing to try is a visual count-in
  (three pips extinguishing as the needle approaches), not a wider lie.
- **"A rising tone across the charge" was asked for and is not here.** The hold is made audible by three
  discrete marks — `bandEdge` / `gold` / `bandEdge` — plus a rising count-in on the mash (tick, tick, TOCK).
  A tone gliding across the charge is still Out for the two reasons in §Out, and there is now a third: a glide
  whose length is the charge length cannot be written in a static cue table without giving `play` a per-call
  duration, which is an engine API change for one call site. If the playtest says the band ticks do not land,
  the cheapest experiment is a fourth pulse at the band's midpoint, not a tone.
- **The Slammer's local clock is right until it isn't.** Booking the band ticks off `performance.now()`
  matches the needle, and the needle is a *prediction* — if the server clamped the mash interval, `mg.tCharge`
  replaces the local value when the phase becomes `charge` (`F07 §Client`) and the drawn band jumps. The
  ticks must be re-booked on that same replacement, and the already-scheduled ones cannot be un-scheduled
  without holding a node reference. Simplest correct answer, and what F18b should do: book the three ticks
  only *after* `mg.phase === 'charge'` has arrived with the server's numbers, accepting one round trip of
  lead-in loss, rather than booking on the local prediction and having to cancel.

## Contract changes required

Nothing in `00-contracts.md` §3, §4, §7, §8 or §13 moves: no schema field, no message, no `mg` op, no config
key, no server code. F18 is client-local, which is why it can ship inside one milestone without a contracts
pass. Three changes are needed and none of them is to the binding sections.

1. **§1 and §12 — a new client directory** *(F18a)*. `resources/js/game/audio/` joins §1's repository layout
   and §12's ownership table as a new row: `Audio | resources/js/game/audio/{Audio,cues,tracks}.ts,
   resources/js/game/__tests__/{Audio,cues,tracks}.test.ts | F18 | main.ts (unlock) · input/Keys.ts (three
   keys) · ui/{Hud,helpContent}.ts · minigames/{Jig,Dock,Slammer}.ts · render/Items.ts ·
   hazards/{FuseFx,DangerBeacon}.ts`. `.ai/rules/dynamite.md` requires approval for a new base folder; this is
   the request, and it is the one thing in this feature still waiting on a yes.

2. **F13 — three lines, F13's owner's call** *(F18a for the third, F18c for the first two)*.
   - F13:26's Out line becomes "Music, and any cue outside F18's table — `volume` has its consumer in
     `audio/Audio.ts` from M1 and gains music in M2 (doc 14)."
   - F13:205's `volume` row's consumer column becomes `resources/js/game/audio/Audio.ts` — the engine every
     cue goes through.
   - `PlayerSettings` gains `muted: boolean` (default `false`), beside `volume`, in F13:122's interface and
     in `DEFAULT_SETTINGS`. Mute as `volume === 0` was the alternative and is worse: it destroys the level
     the player chose, so unmuting cannot restore it. F13's settings panel then draws a checkbox it was
     going to need anyway, and F13's test 21 is unaffected.

3. **F07 — the file that was never written** *(F18c)*. `resources/js/game/minigames/slammerAudio.ts` leaves
   F07's *Owns* line (F07:3), its row leaves the Files table (F07:67), its interface line goes (F07:197),
   its task box is struck through (F07:610), and §Audio (F07:424) becomes a pointer at F18's cue table with
   F07's four frequencies preserved. `00-contracts.md:1006`'s Slammer row drops `slammerAudio` from its file
   list. The sound design is F07's and is unchanged; only the owner of the plumbing moves.

2a. **F13 — `settingsStore.ts` must become the single reader and writer** *(new; F13's owner's call)*. Two
   independent writers to `dynamite.settings` are being set up, and the seam is one method wide today. F18
   keeps `volume`/`muted` in `Engine.current`, reads the key once at construction, and merges on every write
   — correct in isolation. But F13:55 names `ui/settingsStore.ts` as the owner of that key. When F13 lands, a
   write from its panel will not notify `Engine.current`, the engine's in-memory copy goes stale, and the next
   F18 write silently reverts F13's volume change. `mergeAudioSettings` and `coerceAudioSettings` already do
   the hard half. The right fix is **not** a `reload()` on `GameAudio` — that is a method with no caller until
   F13 exists — but for `Engine` to take an injected getter when `settingsStore` arrives, at which point F18's
   two private functions are deleted rather than migrated. That is the whole point of the `StorageLike` seam.
   `muted` stays an F18-added field and F13 should add it to `PlayerSettings` rather than drop it: mute as
   `volume === 0` destroys the level the player chose, so unmuting cannot restore it.

**Withdrawn:** F16's contract change 9 (`render/fumbleAudio.ts` as a second `volume` consumer, F16:1350).
F18 supersedes it — `fumbleAudio.ts` consumes F18, and F18 consumes `volume`.
