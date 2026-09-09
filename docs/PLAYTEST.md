# Playtesting DYNAMITE

This is the facilitator's page. `docs/RUNNING.md` gets the game on screen; this one is about
what to do once it is, what to listen for, and how to write down what went wrong.

The M1 gate (docs/14) is not a bug count. It is this: **in three playtests with people who have
not read these docs, somebody says one of the three sentences below unprompted, and the group
wants to play again.** Everything here exists to find out whether that happens.

---

## 1. Get it running

Follow `docs/RUNNING.md` — install, `.env`, Herd, `cd game-server && npm run dev`. Then, once:

```bash
php artisan migrate:fresh --seed     # accounts, Kaboom & Sons, join code BANG42
php artisan game:levels:sync         # five "created" lines: level-01 … level-04, sandbox
```

`game:levels:sync` reads `config/game/levels/*.json` and is safe to re-run after any level
tuning — it prints `updated <key>` instead. If it prints an error with a JSON pointer in it,
the level file is wrong and nothing was written; fix the file, don't touch the database.

Sanity check before anyone sits down:

```bash
php artisan tinker --execute 'dump(App\Models\Level::orderBy("sort")->pluck("is_active", "key")->all());'
```

Five keys in ladder order, every one `true`. (`--execute` prints nothing unless you `dump()`,
which is why the call is wrapped.)

## 2. Get people in

Two seeded accounts (password `password` for both): `sam@example.com` owns **Kaboom & Sons**
(join code `BANG42`, every level unlocked) and is an admin; `priya@example.com` is a member.
Everyone else registers at `/register` and joins with the code from the factory page.

- **One browser profile per player.** Tabs in the same browser share one session cookie, so the
  second tab is the same person. Use separate profiles, separate browsers, or a private window.
- **Same room, several laptops:** each guest adds `<host-ip> dynamite.test` to `/etc/hosts` and
  accepts Herd's self-signed certificate; the host sets `GAME_SERVER_WS_URL=ws://<host-ip>:2567`
  in `.env` and re-runs `php artisan config:clear`. Prove it from a guest machine *before* the
  session starts:

  ```bash
  curl -k https://<host-ip>/login -H 'Host: dynamite.test'    # must return the login page
  ```

  Remote friends wait for the M4 VPS. Nothing about this is on the internet yet.
- **Short a body?** `FACTORY_ID=1 OUT=/tmp/pt scripts/m0-browsers.sh` drives two headless
  sessions, and with `DEV_ALLOW_NO_TICKET=1` on the game server a tab can join with
  `{ name, factoryId }`. Bot bodies stand still — they fill the start gate, they don't play.

On the factory page, pick today's level from the select (locked levels read "— locked";
Sandbox never locks), then **Enter factory**. In the lobby the HUD reads
`LOBBY · 2/3 players · ENTER starts the shift`; the **host presses Enter**.

Controls: `WASD`/arrows walk · `E` interact · `Space` act (throw, or the beat at a station) ·
`Esc` leave a station · `Tab` order board · `` ` `` debug overlay. **`H` opens the full list in
game, and it knows which station you are standing at** — point people at `H` instead of reading
controls aloud.

## 3. Which level, and who it needs

| Level | Crew | Runs for | The sentence it exists to cause |
|---|---|---|---|
| **Basic Flow** (`level-01-basic-flow`) | 1–6 | 10:00, book of 8 (4 solo) | *"Oh, I bring the keg over here."* |
| **Too Much Powder** (`level-02-too-much-powder`) | 3–6 | 10:00, book of 10 | **"Stop making powder."** |
| **The Bottleneck** (`level-03-the-bottleneck`) | 4–6 | 10:00, book of 13, trucks every 45 s | **"Someone stage crates before the horn."** ¹ |
| **Too Many Helpers** (`level-04-too-many-helpers`) | 4–6 | 10:00, book of 10 | **"No, not everyone."** |
| **Sandbox** | 1–6 | no clock, no book, no grade; debug overlay on at load | — tinkering only |

¹ In M1 there are no crates: staging means *sticks already set on the four ramp lanes before
the truck docks*, which is the only way a truck of 5–8 fits its 20 s window (docs/04). Crates
land in M2, and the sentence keeps its shape. On Level 3 the loud version of the same lesson is
*"Come help Assembly"* — the jig cannot fill a 45 s truck alone.

A first session: **Level 1 once** so everyone learns the route, then **Level 2**. Level 3 and
Level 4 are worth a session of their own: both need four in the lobby (level 3 inverts its own
lesson at three, level 4 has no fourth body to over-help) and both are better with five or six.

Level 1 and Sandbox treat an explosion as a **setback** — every station goes DAMAGED, somebody
repairs, play continues. Levels 2–4 end the day with THE FACTORY EXPLODED. That is the only way
to lose.

## 4. The three sentences

Write down the **minute mark and who said it**, and only if it was unprompted. A sentence you
fished for is not evidence.

1. **"Stop making powder."** — one player telling another to stop being locally productive.
   This is the whole thesis. Level 2 is built to force it.
2. **"No, not everyone."** — somebody waving helpers *off* Assembly. It means the staffing curve
   is legible without a tutorial.
3. **"Someone stage crates before the horn."** — the crew planning one truck ahead instead of
   reacting to the beep.

Near-misses count and are worth writing down verbatim: "we've got loads of kegs, do something
else", "get off the jig", "put them on the ramp *now*". If nobody says anything like any of
this in three sessions, that is the finding — the numbers or the readouts are wrong, not the
players.

## 5. What to watch

Keep this list beside you; note the **minute** for each, not just whether it happened.

- **First keg on the floor.** The moment the OUT shelf is full and a keg lands in someone's
  hands or on the ring. The pile starts here.
- **First hands-full.** Who notices they cannot pick anything up, and what they do about it.
- **First "what can I do?" bubble.** Somebody is stood at a station that does not need them.
- **Who hauls, and when.** Hauling kegs to Assembly and sticks to the dock is the job nobody is
  assigned. Does anyone volunteer? Does the same person do it all day?
- **Does anyone stop Powder before the beacon lights?** Stopping after the beacon is reacting.
  Stopping before it is the lesson landing.
- **The truck run.** Are sticks staged on the lanes before the horn, or is it a scramble? Does
  anyone slam the tailgate?
- **First stomp.** A lit fuse, and someone runs to it. Did they know they could? Did they say
  anything first?
- **Was a NICE SAVE attempted** — a lit keg picked up and thrown into the blast bin? Or did
  everyone freeze and watch it?
- **The report card.** Watch faces on the grade and on "kegs made vs. kegs used". Does anyone
  argue with the bottleneck line?
- **"Again?"** The only question that matters. Ask it once, at the end, and record the answer
  before anyone talks themselves into a reason.

Also worth noting because they are cheap to lose: who quit walking because carrying is slow,
who never found `H`, who never looked at the order board, and anything anybody read aloud off
the screen (that text is doing work).

## 6. Solo, honestly

One player can run Basic Flow and Sandbox (ADR 0013). That is the **taster**, not the game.
Solo, the book shrinks to 4, trucks slow to 90 s and hold 3 sticks, and the whole thing becomes
self-directed time management — genuinely fun, and not the joke the game is about. The joke is
one person saying "stop making powder" to another, which needs another person.

The HUD says `best with 3+` in the lobby whenever fewer than three are connected. Never demo
solo to someone you want an opinion from; give them Level 2 with two friends.

## 7. Reporting a bug

An Electrolyte ticket in project `dynamite`, titled `<level key>: <what happened>` — e.g.
`level-03-the-bottleneck: truck left with 4 sticks still on the ramp`.

In the body:

- **How many players**, and the **minute mark** on the shift clock.
- **Expected vs. actual**, in that order, one line each.
- **Which day, on which factory.** A finished day is a row in the factory's Run history (day,
  level, grade, ended-at); that row carries the `seed` and the whole report in `runs.metrics`,
  which is what makes a report bug reproducible:

  ```bash
  php artisan tinker --execute 'dump(App\Models\Run::latest("ended_at")->first(["id","day","seed","grade","status"])?->toArray());'
  ```

  A day that never ended writes no row — say so, and give the wall-clock time instead so the
  game-server log can be lined up.
- **Browser**, and the `` ` `` overlay's **RTT / tick** line — a screenshot of the overlay
  carries both.
- **A screenshot**, and the game-server terminal lines from around the moment.

Urgency:

| | |
|---|---|
| `urgent` | The factory exploded with no pile, no beacon and no fuse. A loss nobody caused is the one bug that breaks the design. |
| `high` | Client and server disagree (an avatar or item in two places), or the day gets stuck and cannot end. |
| `low` | Visual: wrong sprite, text clipped, an effect that fires late. |

**Tuning opinions are not bugs.** "The trucks are too fast", "the fuse is too short", "Level 4
is unfair" go in a ticket asking to change the number **and the `notes` field of the level
file** that explains it. The numbers in `config/game/levels/*.json` are starting values; the
`notes` are why they are what they are, and both move together.

Check `docs/features/README.md` before filing: it says what is actually finished. Reporting a
missing feature as a bug costs everyone a round trip.
