# 00 — Vision

## The pitch

You and two to nine friends run a cartoon dynamite factory. Every station is fun to operate.
The most fun station is the one that will ruin everything if you don't stop.

Powder is a slot machine. Casing is a rhythm game. Assembly is a two-person jig. Shipping is
a truck with a horn. Nobody is in charge. The round is ten minutes.

By minute three the floor is covered in powder kegs nobody asked for. By minute five, four of
you are crowded around one assembly jig asking each other "what can I do?" while the QA lamp
sits dark. At minute nine the truck honks and everyone abandons their station to push crates.

The end-of-round screen tells the Powder player they were **98% utilized — EXCELLENT**. It
tells the factory it was a **DISASTER**.

Then somebody says *"okay, next round, nobody touch the powder until I say"* — and now it's a
game.

## Comparables

| Game | What we take from it |
|------|----------------------|
| **Overcooked** | Station-based coop, the "plate it NOW" panic, chaos that is your own fault |
| **RV There Yet?** | Physical comedy from shared consequences; one person's mess is everyone's |
| **Factorio / shapez** | Flow, buffers, the bottleneck that moves when you fix it |
| **Papers, Please** | Judgment as a mini-game (QA), the quiet dread of passing something wrong |
| **Rhythm Heaven** | Short, juicy, readable inputs that feel great on a keyboard |

## Theme and tone

The factory makes **cartoon explosives**. Nothing in the game resembles a real process,
material, or chemistry. Materials are absurd on purpose:

Boom Powder · Spark Paste · Fuse Goo · Blast Beans · Boom Juice · Danger Dust · Mega Fuse ·
Red Boom Casing · Deluxe Dynamite · Gold Executive Dynamite

Failure is **smoke, soot, shaking, confetti, and ridiculous paperwork.** Nobody is ever hurt.
A product that "goes off" leaves a soot ring and a sheepish worker. A Hotfix return explodes
on the loading dock into a spill you have to sweep. Alarms are stupid. Customer complaints are
long and unreasonable.

## The core joke (and the core mechanic)

> **Local productivity is not the same as system throughput.**

Every player can be flat-out busy — combo counters climbing, machines thunking — while the
factory ships almost nothing. The game never says this. The game *arranges* for it to happen,
then shows you the numbers.

The allegory (software delivery, agile process, Theory of Constraints, Brooks's Law) is real
but is never spoken by the game. Players who know it will laugh. Players who don't will learn
it by saying "stop making powder" to a friend.

## What this is not

- Not an agile training simulator. No tooltips explaining WIP limits.
- Not a management sim. You never click a spreadsheet. You run, carry, stamp, and slam.
- Not a punishing game. Failure is loud and funny and recoverable in the same round.
- Not a competitive game. There are no per-player leaderboards — except the fake one on the
  end screen that praises whoever hurt the factory most.

## Shape of a session

- **3–10 players** in one factory (one "room"). Above 6 the factory adds a second line
  that shares QA, Packing, and the Dock ([19](19-scaling-3-to-10.md)).
- A **day** is an order book and a 10-minute shift; it ends when the book is done or the
  clock runs out.
- A day ends with a **report card** (A–F, factory-level) and a P&L. Profit × grade = coin.
  At **Payday** everyone votes on one upgrade to buy. C or better unlocks the next level.
  The factory persists on the server between sessions ([18](18-days-grades-and-payday.md)).
- Everything is playable on a laptop keyboard. Mouse is optional.
