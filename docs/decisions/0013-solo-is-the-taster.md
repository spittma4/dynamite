# ADR 0013 — Solo and duo are the taster; 3+ is the real game

**Status:** accepted · 2026-09-09 · supersedes the `players.min ≥ 3` rule from ADR 0011

## Decision

A level may set `players.min` as low as **1**, but only if its `scaling.breakpoints` include a
breakpoint with `maxPlayers <= 2` — i.e. the level is actually *tuned* for a small crew, with a
shorter order book, slower trucks and a smaller `qtyPerTruck`. `validateLevelConfig` enforces
this; a level inviting solo play without small-crew tuning is a config error.

`ScalingBreakpoint` gains an optional `qtyPerTruck: { base, rampPerMinute }` override, because
small crews need *smaller* trucks, not merely fewer of them.

Which levels open up:

| Level | `players.min` | Why |
|-------|---------------|-----|
| 1 — Basic Flow | **1** | The taster. One person can learn the loop: make powder, assemble, ship. |
| Sandbox | **1** | No clock, no grade — the tinkering mode. |
| 2 — Too Much Powder | 3 | The lesson is *saying* "stop making powder" to someone. |
| 3 — The Bottleneck | 3 | Redistributing staff needs staff. |
| 4 — Too Many Helpers | 3 | A level about overcrowding is meaningless alone. |

The lobby says **"Best with 3+"** so the taster never pretends to be the real thing.

## Why

Sam: *"I'd rather tailor it to be playable by 1 than by a min of 3. Hard for adoption."* Then,
sharpening it: *"the best experience requires at least 3 people but can be played by less to
feel it out."*

He is right about adoption: a game that needs three scheduled humans is a game almost nobody
tries, and the first thirty seconds are what decide whether anyone comes back with friends.

But solo is a *different game*, not a smaller one. The core joke — local productivity is not
system throughput — is something one player says to another. Alone it becomes self-directed
time management (Overcooked solo), which is genuinely fun but is not the thesis. So solo is
scoped as the taster: enough to feel the loop and want company, never sold as the experience.

The tuning matters as much as the flag. At one player, Assembly runs at 0.60 on the staffing
curve (2 is optimal, deliberately), and an eight-order book sized for a crew is unfinishable
alone. Flipping `players.min` to 1 without retuning would have produced something startable
and unwinnable — worse for adoption than requiring three people.

## Rejected

- **`players.min: 1` everywhere.** Levels 2–4 are *about* coordination and crowding; solo
  versions of them would teach the wrong thing, or nothing.
- **Lowering the gate without a breakpoint.** Startable, unwinnable. The validation rule
  exists precisely to make that impossible to ship.
- **Flattening the staffing curve for solo.** That would delete the mechanic the whole game
  is built on. A solo player *should* feel stretched — they just need a book they can finish.
- **A separate "solo mode" codepath.** The scaling table already models crew size; solo is one
  more breakpoint, not a second game.

## Consequences

`ScalingBreakpoint.qtyPerTruck` is a new optional key (schema + defaults + `scaleLevel`).
F12's level files carry the per-level minimums in the table above. The dev level used by the
game server today declares `min: 1` with a `maxPlayers: 2` breakpoint (book 4, trucks every
90 s, 3 sticks per truck) so solo is testable now. Mechanics that need a second person —
throw-and-catch, the Jig's A/B pair, the "what can I do?" interrupts — simply never fire
solo; none of them are required to complete a day.
