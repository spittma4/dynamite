# 15 — Open questions

Deliberately unresolved. Each one either gets answered by a playtest or by Sam. When one is
resolved, write the ADR and delete it from here.

| # | Question | Current lean | Decided by |
|---|----------|--------------|------------|
| 1 | **Name.** DYNAMITE (repo name) vs. something with a joke in it (*Boom & Bust*, *Kaboom & Co.*, *Fuse Works*). | DYNAMITE until it matters | Sam |
| 2 | **Art style.** Squares-with-faces for M1 is settled. After: chunky pixel art vs. flat vector cartoon. | Flat vector — cheaper to animate spills and soot | After M1 |
| 3 | **Hard vs. soft player collision.** Soft push (current) vs. hard block (more Overcooked). | Soft, with a config flag | M1 playtest |
| 4 | **Does floor WIP block movement or just slow it?** | Slow to 40% | M1 playtest |
| 5 | **Player count at which a single line is funniest.** Design targets 4–6 per line. Is 6 on one line chaos or noise? Does the breakpoint sit at 6 or 7? | 6 | M1 playtest |
| 6 | **Individual scores?** Doctrine says no. Level 9 says "yes, as a trap". Is there a version of per-player recognition that isn't utilization? (e.g. "most chores done") | No, except the joke | M2 |
| 7 | **Kanban board with manual ticket moving.** Great joke ("WHO MADE THIS?"), risk of becoming a chore that's *not* a punishment. | Prototype in Sandbox during M3, ship only if it produces laughs | M3 playtest |
| 8 | **How much to tell players about the bottleneck mid-round.** Debug overlay shows everything. Should the HUD show *anything*? | Nothing mid-round. Report only. | M1 playtest |
| 9 | **Isometric later?** Sim is layout-agnostic; the question is whether iso reads better for "who is blocking what". | Stay top-down unless it looks bad | After M2 |
| 11 | **Voice.** The game assumes players are on a call. Should there be an in-game ping/emote ("STOP" / "HELP") for people who aren't? | Yes, four emotes, M2 | Sam |
| 12 | **Mini-game overlay size.** Bottom third vs. a small panel anchored to the station. | Bottom third | M1 playtest |
| 13 | **Explosion threshold.** 10 kegs = a full Powder ring + shelf. Too easy to hit at 6 players? Too hard at 2? | 10, scale by player count if playtests say so | M1 playtest |
| 16 | **Heat floor.** Is 0.7 s / ±105 ms too sharp for a laptop? Level 1 can pin `minChargeSeconds = maxChargeSeconds`. | 0.7 s | M1 playtest |
| 17 | **Broom whack.** Swing the broom to knock an item out of a teammate's hands. Funny; griefable in a friend group. | Prototype in Sandbox, ship only if it gets laughs and not sulks | M2 playtest |
| 18 | **Votes per player at 7–10.** One each is clean; does a full house want two? | One | M4 playtest |
| 19 | **Repeat-the-day at D.** Is a forced repeat fun, or does the group want to move on and eat the grade? | Repeat, but let the owner skip once per level | M4 playtest |
| 20 | **Line assignment.** A hat and a label (current) vs. a soft lock with a cost to switch lines (a clipboard). At 10, does free movement dissolve the lines? | Hat only; add a switch cost only if playtests show lines dissolving | M2 playtest |
| 21 | **Per-line Groove display.** One meter is the "we"; would a per-line sub-meter help a ten-person room see who's churning? | Report only, not HUD | M3 playtest |
| 14 | **Does the CEO light a cigar on the Executive Tour?** Funny. Possibly too random for the no-random-loss rule. | No — unless the tour path only crosses tiles with a DANGER beacon already on | M3 |
