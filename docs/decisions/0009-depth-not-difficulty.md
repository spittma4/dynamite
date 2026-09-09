# ADR 0009 — Slower stations get deeper, not harder; fast stations get a greed ceiling

**Status:** accepted · 2026-09-04 · supersedes the v1 mini-game specs

## Decision
"Harder" is split into three axes and treated differently:
- **Execution difficulty** is flat across the factory (no window tighter than ±60 ms;
  downstream never harder to execute than upstream).
- **Decision depth** rises downstream (QA tolerances, Packing's drop planning, Assembly's
  seat-the-dent choice).
- **Skill ceiling** exists at every station; at Tier S it is a *greed ceiling* (the
  Slammer's Heat: mash speed sets charge speed, so a hot hand doubles output and halves the
  window; Casing's combo tempo-up with fixed-ms windows).

Plus three craft rules for every mini-game: one gesture per station, a named across-the-room
tell, and a real Perfect. Juice (combos, shake, confetti, factory-wide stings) is Tier S only.

## Why
Sam asked whether the mini-games were fun and challenging and whether slower delivery tasks
should be harder. An independent critique panel (two lenses per station) found: Tier S had
no skill ceiling and went flat by rep ~20; the Jig's THREAD step was precision steering,
which our own anti-goals ban, and its pair mode gave the partner a Tier D verb; Crate Tetris
had no cursor input and could not fail SNUG; the Dock was a worse copy of the Slammer's
gesture; QA's only reward required a teammate to fail and rubber-stamping was score-dominant
from minute 6.

Making the bottleneck *harder to execute* would have punished whoever volunteered for it
and made Tier A the drudge — exactly what the Fun Gradient exists to prevent. Making it
*deeper* keeps it interesting to hold. Giving Tier S a greed ceiling makes the trap sharper
the better you are, which is the doctrine in one mechanic.

## Rejected
- **Leave v1 as is.** Tier S goes flat by minute 4; the Jig violates our own rules.
- **Tighter windows downstream** ("slower tasks harder"). Drudge at the bottleneck; trackpads.
- **More inputs / more steps** ("more complex"). Complexity is not depth. The Jig already
  had five verbs and was worse for it.

## Refutation pass (same day) and v2.1

Three adversarial refuters rejected the hypothesis *as first stated* (0.62–0.72 confidence),
and were right about two things: (1) a **success-driven** greed ceiling (wobble grows with
the combo — the first idea) makes the round-ending spark a function of skill rather than
carelessness and is farmable by a deliberate early release; the adopted **Heat** is
choice-driven per rep and survives. (2) "Hard to execute = drudge" is falsified by the Rework
Bench: the Jig's inputs with the reward stripped. Drudge is *reward absence*, so the
bottleneck must stay the prized execution seat — **rhythmic, not precise** — that pulls the
expert off Powder. Amendments adopted: two window floors in ms (OK ≥ ±100, Perfect ≥ ±45); a
depth budget of one in-loop decision per station; "one gesture" checked literally.

A synthesis pass over v2 found five places it contradicted its own rules; v2.1 fixes them
without adding an input, a step, or a juice tier: DEAD CENTER was ±26 ms at hot (now ±50 ms
fixed, OK windows in ms); dud/damp kegs now pour slow at the Jig so the early-release dodge
costs the bottleneck; the Jig's POUR and CRIMP become taps so A's loop is one phrase on
`Space` at 150 BPM (two timing judges deleted); the Drop Well is 3 wide so rotation is a
live key; QA gains WITHIN SPEC so its Perfect fires when the card mattered, not only when a
teammate missed; RATTLY narrows the Dock's OK window, not its Perfect; Casing's solo curve is
1.0 so there is no dead gap. **The design is frozen until the M1 playtest.**

## v2.2 — bindings (same day)

Sam: *"we don't need things to only be spacebar driven … arrow keys or WASD is fine too."*
Agreed; v2.1's "one phrase on Space" wording over-corrected. Rule restated: **one gesture ≠
one key** — the gesture is the idea; direction keys are encouraged wherever direction is the
natural verb, and every mini-game uses the same two hands as walking. Bindings changed:
Fuse Knots arrive on a left/right lane (`←`/`→`); Casing's stamps are `←` `→` with `Space`
for the crimp; the Slammer's chutes bind to `←` `↑` `→` as well as `1 2 3`; the toss and the
shove accept `↑` as well as `Space`. No new inputs, steps, or systems.

## Consequences
M1 scope grows at Powder (Heat, DEAD CENTER, in-world show, overflow) and Assembly (Knots,
ratchet crimp, Toss, dents on shelf, PRIME STICK) and the Dock (beep, tailgate). Casing, QA,
Packing v2 land in M2. `baseCycleTime` becomes `nominalSeconds` + `floorSeconds` and the
cycle rule is `max(execution + interrupts, machine)`. Hotfix delay 240 → 120 s.
