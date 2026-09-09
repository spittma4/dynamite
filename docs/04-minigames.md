# 04 — Mini-games (v2.2 — Option C: deeper downstream, greedier upstream)

> v1 was too shallow at Tier S (a slot machine with no skill ceiling), had a banned
> precision-steering step at the bottleneck, an un-failable puzzle at Packing, and a QA loop
> whose only reward needed a teammate to fail. v2 fixes each with one idea per station.
> Rationale in [ADR 0009](decisions/0009-depth-not-difficulty.md). v2.1 applies the
> corrections from the refutation pass recorded there; v2.2 is a bindings pass only —
> directional keys wherever direction is the natural verb. **Design is frozen until the M1
> playtest.**

## Rules for every mini-game

1. **≤ 3 inputs, and the same two hands as the floor.** You walk with WASD/arrows and act
   with `Space`/`E`; every mini-game uses exactly those keys, so you never change hands
   when you step up to a station. Arrows/WASD are **encouraged** wherever direction is the
   natural verb — a lane, a column, a side, a colour. A sticky selector may use `Q`/`E`.
   Mouse is an alternative, never required ([ADR 0006](decisions/0006-keyboard-first-minigames.md)).
2. **< 10 s per cycle** at optimal staffing.
3. **One gesture per station — checked literally, not aspirationally.** Each station is one
   input *idea* with variations — the Rhythm Heaven rule. **One gesture ≠ one key:** "tap on
   the beat" can be ← or → or `Space` depending on which lane the beat is in; what must not
   happen is a checklist of *different ideas* (select, then hold-release, then steer). Slammer = *mash-then-release*. Casing = *tap on the beat*. Jig =
   *tap on the beat* (+ one toss). QA = *park and stamp*. Packing = *drop*. Dock = *shove
   on the beep*. Never a checklist of five different verbs.
4. **Every station names its tell** — what a player at the far end of the floor sees and
   hears that says "this station is going well / badly".
5. **You stay on the floor.** Overlay in the bottom third, anchored to the station. The
   camera never leaves.
6. **`Esc` bails.** The cycle's inputs are forfeit. Combos reset on `Esc`, on stepping off
   the work tile, and on any miss. Written down because the cost of stopping is the point.
7. **Perfect / OK / Miss, everywhere** — including judgment stations (QA's Perfect is a
   correctly tagged FAIL).
8. **A miss makes a worse thing, never nothing,** and someone other than you can see it.
9. **Three axes, kept separate.**
   - *Execution difficulty* is **flat**: two floors, always specified in **milliseconds**
     (never a dial fraction) — no OK/miss threshold under **±100 ms** (jitter-safe for
     server-side judging at ±RTT/2 over home wifi), no Perfect under **±45 ms**. Downstream
     stations are never harder to execute than upstream ones, and a greed ceiling may narrow
     the OK window but never pushes a Perfect sub-jitter.
   - *Decision depth* **rises downstream**: QA reads tolerances, Packing plans a drop.
   - *Skill ceiling* exists **everywhere**, and at Tier S it is a **greed ceiling** that is
     **choice-driven per rep** (how hard you mash sets your own window and rate), never
     success-driven — a ceiling that scales with the combo makes the spark a function of
     skill and is farmable by a deliberate early release.
   - *Depth budget:* **one in-loop decision per station** (seat the dent · which crate · the
     tolerance read · which column). A ≤ 3-input, < 10 s overlay holds no more; the rest of
     the depth lives at the meta layer — who staffs what, when to leave Powder, staging
     before the horn.
10. **Juice budget by tier.** Spend only what the row allows.

| | Combo counter | Screen shake | Confetti | Factory-wide sting | Signature |
|-|:-:|:-:|:-:|:-:|-|
| **S** | ✔ | ✔ | ✔ | ✔ (25×, 50×) | THUNK / KA-CHUNK, rising pitch, flag → beacon |
| **A** | — | — | — | — | one brass flash + chime (PRIME STICK), zip notes |
| **B** | — | — | — | — | *ka-chunk* + GOOD EYE, a chalk mark upstream |
| **C** | — | — | — | — | THOOM + dust (SNUG), THUD + springs, tailgate SLAM |
| **D** | — | — | — | — | a flat *click* |

---

## The Slammer (Boom Powder) — Tier S

**One gesture:** mash, then release. **Tell:** thunk tempo, hopper glow, the beacon pole.

**Loop (1.4–2.8 s, player-paced):**

1. **MASH** the three chutes — `←` `↑` `→` (or `1` `2` `3`), each exactly once, any order.
   `t_mash` = first press → third.
   A **fourth press** (any key) overflows the hopper: a splash over the rim, a hollow slop,
   and a **spill tile at your feet** (fuel 1, yours to sweep). "Three is enough", taught in
   200 ms with no popup.
2. **CHARGE** — hold `Space`. The gauge climbs to the band in
   `t_charge = clamp(2 × t_mash, 0.7 s, 1.5 s)`. The OK window is specified in ms and
   interpolates on `t_charge`: **±225 ms** at a lazy 1.5 s climb → **±105 ms** at a hot 0.7 s.
   The *drawn* band scales with heat; the gold hairline's **DEAD CENTER window is ±50 ms at
   any heat** (never sub-jitter). The hopper **glows** with heat ∝ 1/`t_charge`. No wobble —
   the rate is the read.
3. **RELEASE.** The keg lands in your hands and **auto-shelves** if there's room. Shelf
   full? You're holding it, the plunger won't take input, and the combo is still ticking:
   `E` puts it on the floor at your feet (0.3 s), `Space` throws it, or you walk it over.
   ([ADR 0012](decisions/0012-output-to-hands.md))

| Release | Keg | Feedback |
|---------|-----|----------|
| **DEAD CENTER** (±50 ms of the hairline) | `prime:true`, glows on the shelf and the floor | Bass-drop THUNK, double confetti, hopper flash. Combo +1. |
| In the band | PRIME BOOM 1.0 | THUNK, confetti, pitch rises with combo. Combo +1. |
| Late (red) | damp 0.7, **steaming** | *pfft*. Combo → 0. **A spark lands on the floor ring.** |
| Early | dud 0.4, **grey and deflated** | *clink*. Combo → 0. |

**Heat is the greed ceiling.** Lazy mash (0.8 s) → 1.5 s climb → ≈ ±225 ms window, one keg
every 2.8 s. Hot mash (0.3 s) → 0.7 s climb → ≈ ±105 ms window, one keg every **1.4 s**. A
hot hand doubles output to **8× Assembly's demand** — the shelf fills in 9 s — with half the
window, and every late release is a spark on the pile you just built. Fast *and* sloppy
makes the fuel and lights it. Fast and clean only makes the fuel.

**The pile at your feet is made of kegs you chose to put down**, one at a time, to keep the
combo going.

**The show leaves the station.** Combo tiers are rendered **in-world**, not in the overlay:
10× a flag; 25× steam on every thunk, a factory-wide HOT STREAK brass sting, and the Powder
**beacon pole lights gold** — the same pole the red DANGER beacon uses, so from the dock one
pole tells the story (gold, then red); 50× a brass layer in the music and a one-tile floor
ripple per thunk. Any miss: silence, flag droops, tier → 0.

**Kegs are readable from across the room:** grey/deflated · steaming · normal · glowing —
and they **pour at their quality**. At the Jig, POUR takes 5 beats from a prime keg, 7 from
a damp one, 8 from a dud (`pourBeatsByQuality`). The early-release dodge (a dud is "safe" —
no spark) therefore lands on the bottleneck as +0.8–1.2 s per cycle, 13–20% of Assembly's
6 s, visible as Assembly's shelf backing up and one fewer truck. A prime keg widens the POUR
window ×1.5. The Assembly player wants the Powder player to be *good*, not fast, and can see
it on the shelf.

**Churn:** the band drifts ±8% per cycle. You have to read the dial. Friction, not lockout.

---

## Stamp & Crimp (Casing Prep) — Tier S

**One gesture:** tap on the beat — `←` `→` `Space`, hands alternating then both. **Tell:** the
KA-CHUNK cadence, the flywheel, the pennant.

**Bar (3.0 s base, player-paced, no dead gap — the next tube slides in as the last pops):**

```
0.0  tube slides in ──── 0.4 [DIE]* ── 0.8 STAMP ── 1.2 STAMP ── rest ── 2.0 CRIMP ── 2.2 pop
```
\* DIE beat only appears if a colour switch is armed.

| Beat | Window (OK / PERFECT) | Miss |
|------|-----------------------|------|
| STAMP ×2 — `←` then `→` (left die, right die) | ±130 / ±60 ms | +1 dent, wonky mark |
| CRIMP (the accent) — `Space` | ±100 / ±45 ms | +2 dents, crushed open end. Screen shake is reserved for the crimp. |
| DIE — `Space` | ±130 ms | +1 dent, combo → 0; the colour **still switches** (never the wrong colour by accident) |

| Outcome | Casing |
|---------|--------|
| 3 PERFECT | **GLEAM** — dents 0, visible sheen on the shelf. Combo +1. |
| 3 hits, any OK | clean, matte. Combo unchanged. |
| any miss | dented per the table. Combo → 0. Crumpled casings look crumpled on the shelf. |

**Combo tempo-up.** 0–4 base bar; 5–9 the bar shortens 12%; 10+ it shortens 25% (2.25 s).
**Hit windows stay fixed in ms** — the game tightens as you climb, never loosens. CRIMP's
±45 ms PERFECT sits exactly on the Perfect floor: the accent is the tightest beat in the
game *by design*. Tempo-up also scales the machine floor, and the presses are independent
bars (a solo player on one press runs at full efficiency — curve `{1: 1.0}`), so there is
never a dead gap between tubes. The press
**flywheel** spins with the tempo; at 10× a steam whistle blows and a **pennant** rises. At
10× two presses make ~53 casings/min against Assembly's 10. Casings are 0 fuel, so this is
the **quiet trap** beside Powder's loud one: clutter, hauling, Groove.

**Colour is a beat.** `Q`/`E` arms a switch (the die glows the new colour); the next bar
shows a DIE marker in the slide-in dead time. Hit it → KA-CHING, combo preserved. Order
chips above the selector grey out colours no open order needs; a Rush Order gold chip pulses.
*"WE NEED BLUE"* from Packing is now an ask with a cost, and the combo-chaser who ignores it
makes spec defects.

**DUET.** Both presses run on one clock (one feeder). Each overlay ghosts the other press's
needle. Both CRIMP PERFECT in the same bar → KA-CHUNK-CHUNK, combo +2 each, both GLEAM,
visual confetti. The only Tier S coop hook, and it's audible from the dock.

**Churn:** the *visual* needle jitters ±120 ms; the *beat* stays steady. A player who plays
by ear can still win — "steady hands on a messy floor" only works if steady hands can win.

---

## The Jig (Assembly) — Tier A

**One gesture:** tap on the beat — `Space` for the pour and the crimp, `←`/`→` for the knots
(they come in on a lane) — plus one toss for the partner.
**Tell:** zip-zip-zip every cycle; parts arcing every 6 s; a brass flash; silence = starved.

**Player A — the jig tile (~6 s paired, ~8.5 s solo).** After SEAT, everything is **one
phrase on the beat at the factory BPM** (150 = 0.4 s per beat): `Space` for the pour, `←`/`→`
for the knots, `Space` for the crimp. One timing judge serves the whole station; the key just
says which lane.

| Step | Input | Perfect / OK / Miss |
|------|-------|---------------------|
| **SEAT** | `←`/`→` pick a casing — **dents and colour are drawn on the shelf** — `Space` (sticky to last colour: repeat seat is one press) | Seating a dented casing is *allowed* and sometimes right (leaving it starves you). The dent stays drawn on the jig all cycle, so the CRIMP on it is visibly tense. A dented casing can never be PRIME. |
| **POUR** | The keg tips automatically on seat; the fill line rises over 5 beats (2.0 s; 7 from a damp keg, 8 from a dud). **Tap `Space` as it crosses the mark.** | ±60 / ±140 ms, ×1.5 with a prime keg. Early → `weak`. Late → `overfill` + spill tile. |
| **KNOTS** | Each knot slides in on the **left or right lane**; tap `←` or `→` as it hits the eyelet. Long fuse = 3 knots over 1.2 s; short = 2 over 0.8 s. Beats lock to the music BPM. From across the room, three zips look like alternating hands. | ±60 / ±140 ms. All Perfect → three rising *zips*, fray 0. One OK/miss → fray 1, cosmetic. 2+ missed → `frayed`. **Bounded time, no backtracking.** A 2-zip pattern on a long-fuse order = B fetched the wrong spool; A can `Esc` and swap before CRIMP. |
| **CRIMP** | Three eighth-note ratchet clicks (0.2 s each). **Tap `Space` on the third.** | ±80 / ±200 ms. Miss → `capLoose`; on a dented casing, 0.3 spark (you saw the dent; nothing was random). |

**Player B — the rack tile:** `←`/`→` picks **short/long** against a chip showing the next
two open orders (staying one ahead is a read, not a foot race). `E` spool, `E` cap (0.6 s),
then **hold `Space`** (or `↑` — push toward the jig): a swing-arc marker sweeps rack → jig
over 0.5 s. **Release over the cradle** — the target is the crimp's third click, so *toss-on-the-crimp* is literally a beat
in A's phrase. The stick inherits `orderId` at SEAT from the order chip A seated against, so
QA's pinned card is determinate.

| Toss | Result |
|------|--------|
| Perfect ±120 ms | *tink* — lands in the cradle, A's KNOTS are armed instantly |
| OK ±250 ms | lands on the jig surface; A taps `E` (0.5 s tax) |
| Miss | lands on the **aisle tile** — 0 fuel, but clutter that blocks B's next toss until hauled. A sloppy B litters the aisle in front of everyone. |
| Cradle already full | bounces to the floor. **B's restraint rule** — the Fun Gradient at Tier A scale. |
| A body in the aisle (the fourth helper) | blocks the arc; the part drops on them. |

B never walks, so B is always ahead; the coordination question becomes "does B wait for the
cradle", which is what the tier exists for. Solo keeps the walk to the rack (no toss-to-self),
so pairing is *visibly* better. The natural cadence is toss-on-the-crimp; a good pair looks
like a metronome from the dock.

**PRIME STICK.** Clean SEAT (undented, order colour) + PRIME pour + all knots Perfect + Perfect
crimp → one **brass flash** over the station, one chime, +1 Groove, quality 1.0, and the stick
**gleams** on the shelf and under QA's lamp. No combo, no shake, no confetti — one flash, so it
stays clearly under the Slammer. Any OK anywhere → ordinary stick, *chunk*.

**Churn:** one knot per fuse is delayed ±100 ms.

---

## The Look (QA) — Tier B

**One gesture:** park and stamp. **Tell:** GOOD EYE; chalk marks appearing on upstream stations.

**Why v1 was a checklist:** three of four attributes were binary lookups against a card that
never changed. v2 makes the card matter on every rep and closes the feedback loop so judgment
can actually improve over 100 reps.

**Order tolerance.** Every order line carries `strict | normal | loose` (Gold Executive
strict, bulk red loose, config-weighted).

| Tolerance | Fails on |
|-----------|----------|
| strict | 1 dent, any fill ≠ 1.0, any fray, loose cap, spec |
| normal | ≥ 2 dents, fill ≠ 1.0, frayed, loose cap, spec |
| loose | ≥ 3 dents, frayed, loose cap, spec — ignores fill |

The same 1-dent stick is a PASS under one card and a FAIL under the next.

**Condition is continuous.** Dents render as 0–3 dings with randomized placement and size;
the fill line jitters ±4% around the truth; fray runs from "slightly" to "obviously". Parking
the magnifier on Condition **zooms it 2×** in the overlay — it actually magnifies.

**Inputs.** `←`/`→` park the magnifier (position persists between sticks). **`E` = FAIL,
tagged with the parked attribute** (untagged if parked on nothing). **`Space` = PASS** — the
big stamp on the big key. `Q` is freed. A tagged fail is ≤ 3 presses; the two opposite
irreversible stamps are no longer adjacent keys.

| Decision | Truth | Result |
|----------|-------|--------|
| PASS | flawless | *ka-chunk*. → Packing shelf. (OK) |
| PASS | flawed but **inside the card's tolerance** | *ka-chunk* + a short tick + a small **WITHIN SPEC** decal on the stick. QA's second Perfect — it fires whenever the *card* mattered, not only when a teammate missed. Chains ON FIRE like GOOD EYE. Not speed-based: speed rewards rubber-stamping; borderline-correct rewards the look. |
| FAIL tagged correctly | defect | *ka-chunk* + **GOOD EYE**. → Rework (fast path). **A chalk mark on the source station.** |
| FAIL untagged | defect | → Rework, full time. |
| FAIL | good | Rework finds nothing, **doesn't disassemble it** — the stick rolls back onto QA's shelf with a *WAS FINE* tag and must be re-stamped. You see your own mistake. No popup. |
| PASS | defect | Silent. Ships. **Hotfix in 120 s** (was 240). Any Hotfix that would land after the round fires *during the report* and zeroes that order's credit — so rubber-stamping from minute 8 is not free. |

**The chalk tally.** A correctly tagged FAIL chalks the machine that caused it — dents → the
press, fray/fill/cap → the jig, colour/fuse → the Order Board. Three live marks = a thin red
QA strip on that station's overlay. No debuff, no lockout. Marks fade after 60 s of that
station producing a defect-free stick. Per-station, never per-player. QA's one satisfying
moment gets an audience, and the QA player is telling Casing Prep "hit your beats" without
voice.

**Auto-Check upgrade.** Spec attributes pre-flagged; the human judges condition. ~2.5 s.
QA's job gets more interesting, not less.

---

## Drop Well (Packing) — Tier C

**One gesture:** drop. **Tell:** a 6-pip fill bar on the crate's side; the lid — open,
flat, crooked, bulging, or red-X.

**Why v1 couldn't ship:** nothing moved the cursor, and 1×2 sticks tile a 4×3 grid in any
orientation, so SNUG was un-failable and rotation was a dead key.

**The well is 3 wide** (v2's 4-wide well still tiled trivially with horizontals — rotation
was a dead key). With an odd width no row can be filled by horizontals alone, so every crate
needs verticals, and a vertical dropped in the *middle* column strands the two edge cells
under whatever lands next — a real 2–3-legal-moves-out-of-6 decision per drop. Mega Boom
(2×2) in a 3-wide well leaves a 1-wide column that needs a vertical: "place the big one
first" is a plan, not a rule.

**Gravity.** The next stick is the shelf **head** (FIFO — no shelf selection). It hovers
above the well: `←`/`→` column, `↑` rotate, `Space` drop — ~120 ms fall, *thok*. Pieces
stack; an **overhang leaves a hole underneath**. A stick whose colour/fuse doesn't match the
clipped card **bounces off the rim** with a *bonk* — instant feedback, not a surprise at lid
time. **`↓` yanks** the hovered stick out (everything above drops). **`E` is the lid, only.**
Hold `E` 1 s to lid a partial crate as LOOSE so a bench is never blocked.

**Crate size.** `Q`/`E` before the first stick: **S** 2×2 (2 sticks — the panic crate, no
decision) · **M** 3×4 (6) · **L** 3×6 (9). SNUG = the *chosen* crate has no gaps. This kills the "last crate of every
order can never be SNUG" arithmetic and adds the Dock's "plate it NOW" tension one station
up: small crate now and make the truck, or wait for QA and fill a big one.

**Lid Bounce.** When the count matches the card, the lid drops on a spring and bounces three
times (apexes ~0.45 / 0.30 / 0.20 s — visible from the dock as a flapping lid).

| `E` on… | Crate |
|---------|-------|
| first apex (±100 ms) | **PERFECT** — THOOM, dust puff, the crate hops. **SNUG** if every cell is filled. |
| bounce 2 or 3 | OK — plain *thud*, no bonus |
| after, or never (settles at 1.2 s) | **RATTLY** — *clink-clink* when carried; its *OK* shove window at the Dock narrows (±180 → ±120 ms; the Perfect stays ±70). The dock player notices and yells. |

**Cram.** Well full and you press `Space` again: the shelf-head stick is crammed in
diagonally — *krrnch*, the lid bulges, a strap snaps over it, it auto-closes (never SNUG).
The crate holds one more than its size. The crammed stick is `crushed`: dents 2 at the customer → Hotfix p = 0.5
(M2). Honestly the right call with 8 s on the truck; honestly the wrong one otherwise. The
bill lands on the dock four minutes later. Powder-trap logic at Tier C.

**The miss ships.** `E` on a crate whose contents don't match the card still slams — same
thud, no SNUG — but the lid sits **crooked with a red `?`**, readable from anywhere. It's
valid for the truck. At the customer it's a spec defect: counts 0, back on Returns in 120 s
with *"CUSTOMER GOT BLUE. WANTED RED."*

**Shared shelf + NEED bubble (M2).** Both benches pull from one 8-slot shelf; a stick claimed
on bench A greys on bench B. The station derives `needed = order.lines − (shelf + crate)` and
shows *NEED BLUE ×2* over the bench with the existing bubble system. A fact about shelves,
not advice — a helper can haul the right colour or yell at Casing Prep instead of standing in
the aisle.

**Level 6+ — order-shaped crates.** The order card carries a crate silhouette from a level
set: `long` 2×6, `odd` 3×3-minus-a-corner, `divided` 4×3 with a post. Shapes chosen so
dominoes need mixed rotation. ~17 distinct puzzles per round instead of 80 identical ones. A
pure `tileable(shape, pieces)` in `shared/sim` lints configs on admin save — the same
validator guards the 3-wide well sizes.

---

## The Dock (Shipping) — Tier C

**One gesture:** shove on the beep. **Tell:** THUD vs scrape; the truck sagging on its
springs; the tailgate slam that says "we're done, go back".

**Why v1 was wrong:** hold-and-release is the Slammer's gesture; the Dock had a worse copy
of it, in an overlay that pulled your eyes off the one thing that matters at the dock (the
truck), and a golf-meter miss dumped a Tier D haul on the whole team.

**The beep.** While docked, the truck's reversing alarm beeps at 1 Hz and the bay light
strobes on each beep — floor-wide, no overlay needed. `E` sets a crate on your ramp tile.
**Tap `Space` (or `↑` — push) on a beep** to shove.

| Shove | Result |
|-------|--------|
| Perfect ±70 ms | slides fully in — THUD, the truck sags on its springs, the slot lamp lights |
| OK ±180 ms (±120 for a RATTLY crate — another player's late lid narrows your *OK*, never your Perfect) | scrape, seated, no lamp |
| Miss | the crate **stalls halfway** and blocks that lane; anyone on the tile taps `Space` on the next beep to finish it. ~1 s lost. **Nothing goes to Returns.** |

**Lane = Slot (M2).** The 4 ramp tiles map to the 4 truck-bed columns; each column's
silhouette shows the crate it wants (shape + colour chip). Your tile is your aim. Wrong
column → bumps and rolls back to your feet (1 s). A good stager lines crates along the ramp
in column order during the 40 s gap so the burst is pure shoves; a novice's heap is visible
from anywhere. A spec-wrong crate can't board — caught by a physical bump, not silently.

**Clean Load.** Every crate on a truck lands Perfect/OK on consecutive beeps, no stall, no
bump → the truck bounces hard, +2 Groove on top of the +10, the horn echoes. With 2–3 crates
per truck this is only possible if they were *already at hand* — the reward lands exactly on
"stage before the horn", mechanically. Two loaders shoulder-to-shoulder alternating beeps is
a bucket brigade, which is what the 1.9× staffing curve was pretending already happened.

**Tailgate Slam.** Last silhouette fills → a 3 s window: anyone on the ramp holds `E` 0.5 s →
SLAM, horn ×2, the truck pulls out *now* with full credit. Miss the window → it leaves on the
timer, same credit, no slam. No penalty branch. The slam is the dock's SNUG — one earned sound
per burst — and a floor-wide "go back to your stations" cue that cuts dock lingering.

**Partial truck** leaves on the timer; leftovers go to Returns as before.

**M1, before crates:** `E` sets one *stick* on your ramp tile, one shove per beep. A truck of
8–13 sticks fits the 20 s window only if the sticks are already on and beside the four ramp
tiles before the horn — the staging lesson exists in M1 without crates. Assembly's 4-slot
output shelf → dock is a **haul** in M1 (the Powder player's second job), and that hauler is
the one who sees the pile.

---

## Tier D chores

No combos, no particles, no pitch-shift. A flat *click* when they end.

### Rework Bench
The Jig in reverse: un-crimp (timing press, no Perfect), pull fuse (hold), pour back (hold),
unseat. 6 s if the defect was tagged by QA, 9 s if not. Returns a casing + ½ pour to the
Assembly input shelf. The stick is gone. **If the bench finds no defect** (QA failed a good
stick), it does not disassemble — the stick rolls back to QA tagged *WAS FINE*.

### Sweeping
Grab the broom from its hook (`E`). Walk over each spill tile; 1.5 s per tile while holding
`Space`. Put the broom back or carry it around like an idiot (you can't carry anything else).

### Unjam
A machine jams when an item is thrown or knocked onto one of its work tiles. `E` on the lever.
Hold for 4 s. The progress bar is labelled *WAITING FOR VENDOR SUPPORT*. You cannot do
anything else. Nobody can help.

### Hauling
Pick up (`E`), walk, put down (`E`) on a shelf. The one chore that is *sometimes* the right
call — moving kegs from Powder's floor to Assembly's shelf when Assembly is starved, or a
tossed part off the Assembly aisle. Still not fun.

### Stomp
A fuse is hissing on a keg. Stand on its tile, hold `Space` 1 s. *Ffft.* Once a chain has
started every keg has a 1.5 s fuse and you will get one, maybe two.

### Sand Bucket (M2)
Hangs on the wall by Powder. `E` to grab (you can't carry anything else). `Space` throws it
up to 2 tiles in your facing direction: every fuse in radius 1 goes out and those tiles are
inert for 20 s. Walk it back to the tap, hold `E` 5 s to refill.

### Repair (M2)
An Incident took a station offline. Hold `E` on it for 10 s. Progress bar reads *FILING
INCIDENT REPORT*. Its shelves are empty when it comes back.
