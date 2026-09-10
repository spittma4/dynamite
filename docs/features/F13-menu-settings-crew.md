# F13 — The menu: controls, settings, crew management and getting back out
**Status:** [ ] Design reviewed · [ ] Implemented · [ ] Unit tests green · [ ] Verified in the running app
**Owns:** `resources/js/game/ui/{Menu,menuItems,menuRouting,settingsStore,CrewPanel,SettingsPanel}.ts` · `game-server/src/rooms/crew.ts` · `app/Livewire/Factories/Crew.php` + its view · `app/Actions/{UpdateCrewRole,RemoveCrewMember}.php` · `app/Http/Controllers/Internal/CrewController.php` · `app/Http/Requests/CrewChangeRequest.php` · the migration widening the `factory_members.role` constraint · their tests
**Touches** (contracts §12 — one line each unless noted): `shared/src/messages.ts` (the `crew` and `bye` entries and the guard, F02) · `shared/src/schema/PlayerState.ts` (two fields, F02) · `shared/src/schema/types.ts` (one union, F02) · `game-server/src/sim/World.ts` (**three edits**, F03 — see *World's three lines*) · `game-server/src/rooms/handlers.ts` (one `MESSAGE_HANDLERS` + one `GUARDS` entry + two `RoomControls` members, F03) · `game-server/src/rooms/FactoryRoom.ts` (two `controls` properties, F03) · `game-server/src/laravel/api.ts` (**two edits**: `members[].role` in the mapper, and `postCrewChange`, F03) · `game-server/tests/helpers/world.ts` (one `makeWorld` option, F03) · `resources/js/game/main.ts` (the `escAction` branch and the intent-suppression flag, F04) · `resources/js/game/mount.ts` (two attributes, F04) · `resources/js/game/net/connection.ts` (**three edits**: the `bye` event, its `onMessage`, one clause in `onLeave`, F04) · `resources/js/game/ui/helpContent.ts` (`HELP_HINT` and the `Esc` row, F04) · `resources/views/play.blade.php` and `resources/views/livewire/factories/show.blade.php` (one line each, F01) · `app/Enums/FactoryRole.php`, `app/Policies/FactoryPolicy.php`, `app/Http/Controllers/Internal/FactoryConfigController.php`, `routes/internal.php` (F01)
**Reads:** `docs/features/00-contracts.md` (v2.1 — binding) · `docs/decisions/0014-two-difficulty-dials.md` and `docs/features/F14-difficulty-tuning.md` (**the dials, their storage, their carrier and their form are F14's; F13 only displays them**) · `docs/decisions/0009-depth-not-difficulty.md` · `docs/decisions/0013-solo-is-the-taster.md` · `docs/features/F01-laravel-foundation.md` · `docs/features/F04-client-core.md` · `docs/features/F11-day-report-grade.md`

## Goal

A player who clocks in can get back out. `Esc` on the floor opens a menu with **Resume**, **Controls**, **Settings**, **Crew** (owners only) and **Leave factory**; `Esc` at a station still leaves the station, exactly as it does today. Controls is the panel `H` already draws — the same `helpContent.ts` sections, not a second copy. Settings splits in two and says out loud which half is which: volume, reduced motion, a colourblind-safe palette and UI scale are the player's own and never leave their browser; **Dexterity** and **Pressure** (ADR 0014, built by F14) belong to the factory, are set by its owner in Laravel, ride into the room on `FactoryState`, and appear here as two read-only rungs with the numbers they produced. Crew shows who is in the room and where they are working, promotes a friend to co-owner, removes someone who should not be there, and hands out the invite link — from inside the canvas, none of it trusted from the client. Leaving drops the reconnect token and returns to the Laravel factory screen; the owner leaving mid-shift costs the crew a host and nothing else.

## Scope

**In (M1):**
- The menu overlay: item list, keyboard navigation, four panels, and the `Esc` routing rule that makes one key mean "back out one level".
- Per-player settings in `localStorage`: `volume`, `reducedMotion`, `colourSafe`, `uiScale`. Read by the render and audio layers only.
- The per-factory half of Settings: a **read-only** display of the two rungs the room is running — `FactoryState.dexterity` / `pressure`, F14's schema fields — and the level numbers they produced, plus a line saying where they are set and when a change lands.
- Crew management: the roster, promote/demote to co-owner, remove, and the invite link, in both the Laravel factory screen and the in-game panel, over one `crew` message whose permission check lives on the server.
- One signed internal endpoint so Node can write a crew change through to Laravel, and refuse the change when Laravel does not confirm it.
- `bye`, the one server→client message that tells a player why their socket just closed.
- Leaving: the token, the consented leave, and the redirect.

**Out (later milestones):**
- **The dials themselves.** `shared/src/sim/difficulty.ts`, `factories.dexterity` / `pressure`, `FactoryState.dexterity` / `pressure`, the `copy.difficulty` section, the owner's form on `Factories\Show`, the admin override screen and the tempo floors are all **F14's**. F13 owns no transform, no column, no schema field of the dials and no select.
- **Changing a dial from inside the room.** ADR 0014: the room reads its config once, at create. The menu says so and puts the exit one keypress away. See Risks.
- Rebindable keys and a mouse mode (ADR 0006 keeps M1 keyboard-first; revisit when a mini-game asks for a cursor).
- Music and SFX beyond F07's Slammer audio — `volume` has exactly one consumer in M1 and gains the rest in M2 (doc 14).
- Transferring ownership outright, leaving a factory *as a member*, per-member grants finer than owner / co-owner / member — **M4**.
- Reverb-backed presence on the factory screen — **M4**, per F01's Out list. The in-game roster reads `FactoryState.players`, which is already live; the Laravel roster is a page load.
- Pausing. Not a later milestone either — see Behaviour §2.

## Landing order: two stages, one doc

F13 is one feature with two halves that share nothing technically. **Stage A** is client-only: `menuRouting`, `menuItems`, `settingsStore`, `Menu`, `SettingsPanel`, `CrewPanel`'s read-only roster, the `main.ts` / `mount.ts` / `helpContent.ts` touches, and **Leave factory**. It touches no schema, no migration and no endpoint. **Stage B** is the crew half: `FactoryRole::CoOwner`, the constraint migration, the two Actions, the internal endpoint, the two `PlayerState` fields, `crew.ts`, `crew` / `bye`, `RoomControls.evict` / `postCrewChange`, and eviction.

They stay in one doc because they share one overlay, one permission model and one contracts pass. They are staged because a builder who lands them together puts a migration, a schema change, a signed endpoint and an eviction path into a single review, and the client half — the part a playtester actually asked for — waits behind all of it.

| Stage | Gated on | What it ships |
|---|---|---|
| A — the menu | nothing | Everything above, plus Settings' lower half drawing the numbers off `conn.config.level`. Where F14 has not landed, the rung *labels* are a placeholder line (see §5) and their acceptance box stays unticked; every other Stage A box can be ticked on its own. |
| B — the crew | Stage A, for the overlay it hangs in | The whole crew half. Nothing in it waits on F14. |

The rung labels become real the moment F14's contract changes 4, 6 and 11 land, and no F13 file changes when they do.

## Design

### Files

| Path | Responsibility |
|---|---|
| `resources/js/game/ui/menuRouting.ts` | Pure: `escAction(open, overlayAte, stationId, joinMode)` → `'close' \| 'leave-station' \| 'open'`. The whole `Esc` rule, testable without Phaser. |
| `resources/js/game/ui/menuItems.ts` | Pure: `MenuItem`, `menuItems(canManageCrew)`, `moveSelection(index, delta, count)`. |
| `resources/js/game/ui/Menu.ts` | The overlay: a translucent panel at scene depth 50, the item list, panel swapping, and the `Keys` subscriptions it holds while open. |
| `resources/js/game/ui/SettingsPanel.ts` | The four player toggles, and the two factory rungs with the numbers they produced. |
| `resources/js/game/ui/CrewPanel.ts` | Roster rows from `FactoryState.players` (name, colour, role, connected, station), the three owner actions, the invite link. |
| `resources/js/game/ui/settingsStore.ts` | Pure over an injected `Storage`: `PlayerSettings`, `DEFAULT_SETTINGS`, `readSettings`, `writeSettings`. Every access is wrapped — a browser in private mode throws on `localStorage`, and a menu that cannot be opened is worse than a setting that will not stick. |
| `game-server/src/rooms/crew.ts` | `canManageCrew`, `canManageRoles`, `onCrew`. Every refusal lives here; the write-through goes out through `ctx.room`, so this file never sees `Env` or `fetch`. |
| `app/Actions/UpdateCrewRole.php` | Promote/demote in a transaction with `Factory::lockForUpdate()`; refuses to touch the owner. |
| `app/Actions/RemoveCrewMember.php` | Detach the pivot row; refuses the owner. |
| `app/Http/Controllers/Internal/CrewController.php` | `POST /internal/factories/{factory}/crew`; re-checks the actor's role before delegating. |
| `app/Livewire/Factories/Crew.php` + `…/factories/crew.blade.php` | The factory-screen roster: role badges, promote/demote/remove, the invite link with a copy button. |
| `database/migrations/…_add_co_owner_role.php` | The widened `factory_members.role` check constraint — **on Postgres only**; see *Data & config*. |
| `tests/Feature/Factories/CrewTest.php`, `tests/Feature/Internal/CrewEndpointTest.php`, `tests/Unit/Actions/UpdateCrewRoleTest.php` | Pest. |
| `game-server/tests/crew.test.ts` · `resources/js/game/__tests__/{menuRouting,menuItems,settingsStore}.test.ts` | vitest. |

### Interfaces

**Consumes**

- `resources/js/game/ui/helpContent.ts` (F04): `helpSections(station: StationType | null): HelpSection[]` (`helpContent.ts:90`) and `HelpSection` (`helpContent.ts:6-9`). **Controls renders those rows and nothing else.** There is no second controls table anywhere in F13; when F07–F09 change a binding they change `helpContent.ts` and the menu follows.
- `resources/js/game/ui/Hud.ts` (F04): `Hud.help(open, station)` (`Hud.ts:260-266`) already draws that panel, so Controls calls it rather than re-laying it out. F13 owns only the fact that an item opens it and `Esc` closes it.
- `resources/js/game/input/Keys.ts` (F04): `KeyEvents` (`Keys.ts:13-28`), `keys.on(...)`, `keys.setOverlayRouting(on)` (`Keys.ts:145-151`). `Esc` already emits `leave` (`Keys.ts:101`) and `H` already emits `help` (`Keys.ts:118-120`); F13 adds no key.
- `resources/js/game/net/connection.ts` (F04): `Connection.send`, `config`, `state`, `me`, `sessionId`, `room`, and the exported `reconnectKey(factoryId)` (`connection.ts:55-57`) — the menu clears the token itself with `sessionStorage.removeItem(reconnectKey(...))` rather than asking F04 for a new method.
- `resources/js/game/mount.ts` (F04): `MountData` (`mount.ts:7-14`), extended with `inviteUrl` and `factoriesUrl` (contract change 6).
- `FactoryState.dexterity` and `FactoryState.pressure` (F14's contract change 6): two `Rung` integers, written once by F03 in `onCreate`. **The rungs reach the client on the schema, not in `ConfigMsg`** — contracts §4 fixes `ConfigMsg = { level; layout; copy }` (`00-contracts.md:214`) and F14 widens the *HTTP* config reply rather than the message, so the panel reads `conn.state` (`connection.ts:194-196`) for the rungs and `conn.config` for everything else.
- `DEXTERITY_RUNGS` / `PRESSURE_RUNGS` from `shared/src/sim/difficulty.ts` (F14): the panel indexes them with those two integers to get a name, then prints `copy.difficulty.dexterity[name]` / `.pressure[name]` (F14's contract change 11), which rides the `copy` already on `ConfigMsg` and so needs nothing new. The name type is derived locally as `(typeof DEXTERITY_RUNGS)[number]`; F13 asks F14 for no extra export. It never calls `applyDifficulty` and never writes a rung.
- `game-server/src/sim/World.ts` (F03): `world.factory` (`World.ts:117`), `world.members` (`World.ts:118`), `world.toast`, `world.state.players`, `world.removePlayer` (`World.ts:288-298`).
- `game-server/src/rooms/lobby.ts` (F03): `chooseHost` (`lobby.ts:47-66`) — F13 does not re-implement host selection; removing a player triggers the room's existing `recomputeHost` (`FactoryRoom.ts:286-292`).
- `game-server/src/laravel/api.ts`'s `call` (`api.ts:47-68`): the write-through is signed exactly like the existing two calls (contracts §5).
- `App\Models\Factory::members()` with the `role` pivot (`Factory.php:47-52`) and `addMember` (`Factory.php:86-89`); `App\Enums\FactoryRole` (`FactoryRole.php:7-11`); `App\Policies\FactoryPolicy` (`FactoryPolicy.php:16-19`, which today has only `view`; F14 adds `tune`).

**Produces**

```ts
// shared/src/messages.ts (F02's file; F13 appends)
export type CrewOp = 'promote' | 'demote' | 'remove';
export type CrewMsg = { op: CrewOp; userId: string };
export type ByeMsg = { reason: 'removed'; text: string };
export function isCrewMsg(p: unknown): p is CrewMsg;

// shared/src/schema/types.ts (F02's file; one line)
export type FactoryRoleName = 'owner' | 'co_owner' | 'member';

// game-server/src/laravel/api.ts (F03's file; F13 appends one function and three types)
export type CrewChange = { actorUserId: string; op: CrewOp; userId: string };
export type CrewMember = { userId: string; name: string; role: FactoryRoleName };
export type CrewResult = { ok: true; members: CrewMember[] } | { ok: false; status: number };
export function postCrewChange(env: Env, factoryId: string, change: CrewChange, fetchImpl?: typeof fetch): Promise<CrewResult>;

// game-server/src/rooms/handlers.ts (F03's file; two members on an existing interface)
interface RoomControls {
    // …existing startDay / sendConfig
    evict(sessionId: string, text: string): void;
    postCrewChange(actorUserId: string, op: CrewOp, userId: string): Promise<CrewResult>;
}

// game-server/src/rooms/crew.ts
export function canManageCrew(world: World, sessionId: string): boolean;    // owner or co-owner
export function canManageRoles(world: World, sessionId: string): boolean;   // owner only
export function onCrew(ctx: HandlerContext, msg: CrewMsg): void;

// resources/js/game/ui/menuRouting.ts
export type EscAction = 'close' | 'leave-station' | 'open';
export function escAction(menuOpen: boolean, overlayAte: boolean, stationId: string, joinMode: JoinMode | null): EscAction;

// resources/js/game/ui/menuItems.ts
export type MenuKey = 'resume' | 'controls' | 'settings' | 'crew' | 'leave';
export interface MenuItem { key: MenuKey; label: string }
export function menuItems(canManageCrew: boolean): MenuItem[];
export function moveSelection(index: number, delta: number, count: number): number;

// resources/js/game/ui/settingsStore.ts
export interface PlayerSettings { volume: number; reducedMotion: boolean; colourSafe: boolean; uiScale: number }
export const DEFAULT_SETTINGS: PlayerSettings;
export function readSettings(storage?: Storage): PlayerSettings;
export function writeSettings(next: PlayerSettings, storage?: Storage): void;
```

Laravel route (added to `routes/internal.php`; the whole file already runs inside `EnsureGameServerSignature`, applied to the group in `bootstrap/app.php:18`, so the route inherits it without a per-route middleware line):

| Method · path | Name | Body | Answers |
|---|---|---|---|
| `POST /internal/factories/{factory}/crew` | `internal.factories.crew` | `{ actorUserId: int, op: 'promote'\|'demote'\|'remove', userId: int }` | `200 { ok: true, members: [{ userId, name, role }] }` · `403 { error: 'forbidden' }` · `422` |

`GET /internal/factories/{factory}/config` grows a `role` on every `members[]` entry (`FactoryConfigController.php:43-47`), alongside the top-level `difficulty` key F14 adds in the same file. Node's mapper drops fields it does not name (`api.ts:89-100`), so `role` is an explicit addition there too.

### World's three lines

`World.ts` is F03's and F13 edits three places in it. They are listed here rather than left implied, because two are one-liners inside methods F03 wrote and the third changes a public type:

1. **`readonly members` (`World.ts:118`)** — entries gain `role: FactoryRoleName`, matching `FactoryConfigResponse` (contract change 8). The property is `readonly`, which freezes the reference and not the array, so §6 step 6 updates it **in place**: `world.members.length = 0; world.members.push(...result.members);`. An assignment does not compile, and swapping the array would strand any reference already handed out.
2. **`addPlayer` (`World.ts:258-285`)** — two writes on the new `PlayerState`: `connected = true`, and `role` looked up in `world.members`, falling back to `'owner'` when `auth.userId === factory.ownerUserId` and to `'member'` when the member list is empty (the local-level case, `FactoryRoom.ts:295-301`).
3. **`setConnected` (`World.ts:300-302`)** — one line mirroring the runtime flag onto `PlayerState.connected`.

**F13 owns both new fields, not F03.** An earlier draft split them — `connected` to F03 because `setConnected` is F03's method, `role` to F13 — and left the split open as a question. It is the wrong cut. F03 reads neither field; the two are one fact (who is on this roster, and are they here); and a field whose writer lives in one feature and whose only reader lives in another is exactly the drift §12 exists to stop. Both go under F13 in §3's writers-by-field table, as Touches on F03's file.

### Data & config

**F13 stores one thing: a third role.** `FactoryRole` gains `CoOwner = 'co_owner'`.

The widening migration is **driver-aware, and does nothing on SQLite**. Both halves need saying, because the two databases in this project disagree about what a check constraint is:

- **Postgres (production, `.env:23`).** `$table->enum('role', …)` compiles to `varchar(255) check ("role" in (…))` (`PostgresGrammar.php:972-978`), which Postgres names `factory_members_role_check`. A database that has already run the create migration holds the two-value constraint and will reject `co_owner`, so `up()` is a `DB::statement` dropping that constraint (`IF EXISTS`) and a second adding the three-value replacement. `down()` demotes every `co_owner` to `member` first — the narrower constraint cannot be added over a row that violates it — and then swaps the constraint back.
- **SQLite (the Pest suite, `phpunit.xml:26-27`, `:memory:`).** The same `enum` compiles to `varchar check ("role" in (…))` (`SQLiteGrammar.php:873-879`), inline and unnamed; SQLite has no `ALTER TABLE … DROP CONSTRAINT` and nothing to name in one. There is also nothing to widen: the create migration builds its list from `array_column(FactoryRole::cases(), 'value')` (`…_create_factory_members_table.php:17`) and the suite rebuilds the schema from scratch every run, so the moment `FactoryRole::CoOwner` exists the create statement itself emits the three-value check.

So both `up()` and `down()` guard on `DB::getDriverName() === 'pgsql'` and return early otherwise. The alternative — a table rebuild on SQLite — would be machinery written to reproduce a constraint the create migration already emits correctly.

That same enum-derived list means a **fresh** Postgres migrate also emits three values, and the widening statement then drops and re-adds a constraint that was already right. Harmless, and the cheaper of the two options: the migration has to be correct for the database that has already run, and deciding at runtime which one it is costs more than re-executing two DDL statements once.

The enum-derived list is itself a trap — a historical migration whose meaning changes when application code changes. Naming it rather than fixing it: freezing the literal `['owner', 'member']` into the create migration is F01's call on F01's file, and doing it from inside F13 would make this doc's migration unnecessary on a fresh database and still necessary on an old one, which is the state we are in either way.

Everything about the two dials — the rung names, the factor tables, the columns, their defaults (`bareHands` / `fullBook`) and the forms that write them — is F14's. F13 renders `conn.state.dexterity` / `conn.state.pressure` and the numbers already sitting in `conn.config.level`, and holds no copy of either.

**Client-local settings** live under one key, `dynamite.settings`, as JSON. There is no server copy and no migration; a player who switches browsers gets the defaults. That is a deliberate trade: a per-account settings table would mean a Laravel write from inside the canvas for a value that only ever affects one canvas.

### Behaviour

#### 1. `Esc` backs out one level

Today `Esc` emits `leave` from `Keys` (`Keys.ts:101`); `main.ts:129-131` offers it to the mini-game overlay first (`Host.handleKey`, `Host.ts:119-123`) and otherwise sends `leave` to the server, where the handler returns immediately if the player is not at a `press` station (`handlers.ts:156-167`). So `Esc` on the floor is already a no-op on the wire — F13 fills that hole rather than moving anything.

`escAction` decides, in order:

1. the menu is open → `'close'`;
2. the overlay consumed the key → nothing (the overlay's answer wins, unchanged);
3. `stationId !== ''` **and** the station's `joinMode === 'press'` → `'leave-station'`, i.e. today's `conn.send('leave', {})`;
4. otherwise → `'open'`.

Step 3's `joinMode` test matters. At the dock (`joinMode: 'stand'`, contracts §7) standing on the tile *is* the membership, and the server refuses `leave` there (`handlers.ts:164`), so without the test a dock worker could never open the menu: `Esc` would send a message the server drops and nothing would happen. The client mirrors the server's rule rather than guessing at it.

`main.ts`'s touch is one line: `keys.on('leave', …)` calls `escAction(...)` and switches on the result.

#### 2. The menu does **not** pause

The sim keeps running at 20 Hz while the menu is open. `World.tick` advances `state.clock` in every phase and runs every system while `running` (contracts §11); the shift clock, the truck timer and any lit fuse do not care what a client is looking at.

This is the right answer, not a shortcut. A pause would have to be agreed by every client and enforced by the server, which hands one player a button that stops four other people's shift — a griefing lever in a game whose whole subject is one person's local decision costing the system. It would also have to freeze `clock`, which every `*Until` field and every mini-game timestamp is measured against (contracts §3), so "pause" is really "rewind every deadline in the room". And a paused Sandbox is still multiplayer, so "pause in Sandbox only" buys nothing.

What the menu does instead, so that reading it is not a death sentence:

- Opening it sends one `input { dx: 0, dy: 0, seq }` and suppresses further input sends until it closes (a flag read by `sendInput`, `main.ts:108-117`; on close, one send resyncs from `keys.intent`). The player stops walking. WASD still writes into `keys.intent` because `Keys` owns that object; the suppression sits at the send site, the only place that decides what the server hears.
- `keys.setOverlayRouting(true)` while open, so the arrows navigate the menu rather than the floor (`Keys.ts:145-151`, `Keys.ts:207-220`).
- The panel is translucent over the floor and never covers the HUD banner or the Groove bar: a player reading their settings still sees `EXPLODED` arrive.
- Nothing about the menu changes what the server does to that player. They can still be knocked over, sooted, driven off on a truck, or blown up while it is open. The menu is a UI, not a state.

The HUD hint gains a second half rather than being replaced: `HELP_HINT` becomes `'H · what do I do?   Esc · menu'` (`helpContent.ts:16`, drawn at `Hud.ts:107-114`). The first half keeps its wording on purpose — F04 wrote it as a question rather than a label because "a player stuck on 'where does this keg go' does not press a key labelled help" (`helpContent.ts:11-15`) — and F13 has no reason to undo that. The `Esc` row (`helpContent.ts:24`) gains the second half of its truth.

#### 3. Controls

`Controls` calls `hud.help(true, stationTypeOfMe)` — the identical panel `H` opens, from the identical `helpSections(...)` rows. `Esc` (or `H`) closes it and returns to the item list. F13 contributes no control text; the two lines it adds to `helpContent.ts` are the hint and the `Esc` row's new clause, and both are Touches on F04's file.

#### 4. Per-player settings — client-local, and never near the sim

| Setting | Type | Read by |
|---|---|---|
| `volume` | `0…1`, default `0.7` | F07's `minigames/slammerAudio.ts` — the only audio in M1 |
| `reducedMotion` | boolean, default `false` | `fx/Fx.ts` (skips `cameras.main.shake`, caps particle counts) and F10's blast flash |
| `colourSafe` | boolean, default `false` | the `render/palette.ts` consumers: swaps the gold/red beacon pair (`UI.beaconGold` `0xf5c542` / `UI.beaconRed` `0xd9463d`, `palette.ts:57-58`) for a blue/orange pair **and** puts a `!` glyph on the red beacon, because recolouring alone still leaves one bit of information carried by hue |
| `uiScale` | `0.8 \| 1.0 \| 1.25`, default `1.0` | `Hud`, `Host`'s panel, and the menu's own text |

These may never touch the sim, and the rule is structural rather than a matter of discipline. The server judges every input against its own clock and its own copy of the config (contracts §7), and the client "never decides an outcome". A per-player setting that widened a window or slowed a tempo would not make the game easier — it would make the drawing disagree with the judgement, so the player would see a hit and be scored a miss. So `settingsStore` has exactly one class of consumer (render and audio) and there is no code path from `PlayerSettings` into `Connection.send`. Test 21 asserts that against the import graph, because an invariant a human has to remember is not an invariant.

The dials sit in the same panel precisely so the difference is visible: the top half is "how this looks and sounds to me", the bottom half is "how hard this factory is for all of us", and only one of them has a name on it.

#### 5. The two dials, seen from inside the room

The rungs arrive on the schema, not in the config message. F14 writes `FactoryState.dexterity` and `FactoryState.pressure` once in `FactoryRoom.onCreate`; the panel reads them off `conn.state` (`connection.ts:194-196`), indexes `DEXTERITY_RUNGS` / `PRESSURE_RUNGS` for the name (`mittens` … `hairTrigger`, `slowWeek` … `quarterEnd`) and prints F14's label for it out of `copy.difficulty`. There is deliberately no `conn.config.difficulty`: contracts §4 fixes `ConfigMsg = { level; layout; copy }` (`00-contracts.md:214`), F14 adds `difficulty` to the *HTTP* reply and to `FactoryState` but never to the message, and a field on `ClientConfig` (`connection.ts:34-38`) that nothing on the server writes is worse than no field at all.

Beside each rung, the numbers it produced, read straight off `conn.config.level`: the crimp and shove windows and the knot tempo for Dexterity, the order book and truck interval for Pressure. Those are already transformed — `applyDifficulty` runs inside `validated()` (`levels.ts:46-65`) before the room object exists, and `configPayload()` ships `world.level` exactly as it stands (`FactoryRoom.ts:272-274`). The panel does no arithmetic of its own; it prints what the room is holding.

**Opening the panel re-requests the config**, with the client→server `config` message that already exists (§4's `ClientMsg.config`, routed to `RoomControls.sendConfig`, `FactoryRoom.ts:75-77`), and the panel re-renders when the reply lands. Not defensive habit — `world.level` changes shape at the whistle. `startDay` assigns the scaled level over it (`World.ts:341-342`, called at `FactoryRoom.ts:201`) and `scaleLevel` overwrites `day.orderBook`, `orders.everySeconds` and `orders.qtyPerTruck` from the breakpoint for the crew's size (`scale.ts:33-41`). So the copy sent to a lobby join (`FactoryRoom.ts:152`) carries the authored book and the copy sent to a mid-day reconnect (`FactoryRoom.ts:174`) carries the scaled one; without the re-request, two players in one room read different Pressure numbers off the same panel and neither is wrong. Pressure multiplies the authored value and every breakpoint by the same factor (F14's `book` and `cadence` rows), so either number answers "did the dial arrive" — but only one of them is what the crew is facing, and a panel whose whole argument is *checkable numbers* cannot be the thing that guesses.

Below them, one line: *"Your owner sets these on the factory screen. A change lands the next time this factory opens a room — not in this one."*

"Next room", not "next shift". ADR 0014 says outright that the second is the wrong promise (`0014-two-difficulty-dials.md:203-207`): this room is the only shift it will ever run, so a crew told "next shift" would reasonably press `NEXT DAY` and expect the change — and `NEXT DAY` delivers it only because F11 makes the next day a fresh room. "Room" is a word more of jargon and exactly true.

Read-only, and not out of caution. The re-request above re-sends what the room is already holding; it never re-resolves anything from Laravel, and ADR 0014's consequence is explicit: the room reads its config once, at create, so a rung changed anywhere — the factory screen, an admin override, or a hypothetical message from this menu — could not reach a room that is already up without re-resolving the level mid-life. And a rung changed mid-shift would move the windows a crew is being graded against half way through the run about to be posted to `POST /internal/runs`, so the report card would describe a level that never existed. Showing the rungs where the crew is actually feeling them, next to the numbers they caused, and naming the door out, is the whole of what the menu can honestly offer.

Printing the numbers rather than only the rung is the part that earns its place. "Dexterity: work gloves" tells a crew nothing they can check; "work gloves · crimp OK ±280 ms · knots every 0.5 s" tells them whether the change they made upstairs actually arrived.

**Before F14 lands**, `FactoryState` has no `dexterity` or `pressure` and `copy` has no `difficulty` section, so there is no name to print and rung `0` read off an absent schema field is indistinguishable from `mittens`. The panel prints one placeholder line in the label's place — *"This factory has no difficulty settings yet."* — and prints the numbers regardless, because those come from `conn.config.level` and are true either way. That is Stage A's honest half of the panel, and it disappears without a code change the moment the fields exist.

#### 6. Crew management

The panel lists one row per entry in `FactoryState.players`: colour swatch, name, role badge, connected, and where they are — `stationId` through `STATION_LABEL` (F05), or "on the floor", or "away" when `!connected`. Both `role` and `connected` are new schema fields (contract changes 1 and 2); `connected` exists today only in `PlayerRuntime` (set by `World.setConnected`, `World.ts:300-302`) and the client cannot see it, so the roster would otherwise show a disconnected player as present.

Actions, and who may take them:

| Action | Owner | Co-owner | Member |
|---|---|---|---|
| See the Crew item | ✅ | ✅ | ❌ (presentation only — see below) |
| Copy the invite link | ✅ | ✅ | ❌ |
| Remove a `member` | ✅ | ✅ | ❌ |
| Remove a `co_owner` | ✅ | ❌ | ❌ |
| Remove the owner | ❌ | ❌ | ❌ |
| Promote / demote | ✅ | ❌ | ❌ |

(Moving a dial is F14's `FactoryPolicy::tune` — owner or site admin — and happens in Laravel, not here.)

Hiding the item from a member is presentation. **The permission that counts is `crew.ts`'s**, and it is checked against `world.factory.ownerUserId` and `world.members[].role` — the values that came from Laravel over the signed seam — never against `PlayerState.role`, which is a display mirror the server itself wrote. One source of truth, with the mirror downstream of it.

`onCrew`, in order:

1. `isCrewMsg` (the `GUARDS` entry, `handlers.ts:66-75`) — shape only, per contracts §4.
2. Cooldown: one crew change per session per second. A handler that reaches Laravel is a handler that can be used to hammer Laravel.
3. `canManageCrew`; `promote`/`demote` additionally `canManageRoles`.
4. Target rules: the target must be a member of this factory; `userId === world.factory.ownerUserId` is refused for every op; `remove` of a `co_owner` needs `canManageRoles`; self-removal is refused (leaving is **Leave factory**, and that needs no permission).
5. `ctx.room.postCrewChange(actorUserId, op, userId)`. Laravel **re-checks the actor's role** before it writes. Node holds the shared secret, so this is not defence against a forged request; it is defence against a bug in Node, and it is the layer that owns the database.
6. On `{ ok: true }` only: refill `world.members` **in place** from the response (see *World's three lines*), rewrite every seated player's `PlayerState.role`, and — for `remove` — evict the target (§7).
7. On anything else: change nothing locally and toast the actor. A crew change is authority, not telemetry; unlike `postRun` (`FactoryRoom.ts:321-338`) it must not be applied optimistically and retried, because a room and a database that disagree about who is a member is exactly the state the seam exists to prevent.

**Why the write-through goes out through `RoomControls`.** `crew.ts` is a handler module, and a handler gets `HandlerContext { world, sessionId, player, room }` (`handlers.ts:38-43`). `World` holds no `Env` — `WorldInit` is `{ config, state, seed, log? }` (`World.ts:88-93`) and the file does not mention one — while `api.ts`'s `call` needs `env.LARAVEL_URL` and `env.GAME_SERVER_SECRET` (`api.ts:47-56`). Three ways out, and only one is right:

| Option | Cost |
|---|---|
| `readonly env: Env` on `WorldInit` / `World` | Puts credentials and a `fetch` within reach of every system and every `makeWorld` test. `World` is the part of the server with no network in it; that is why it can be ticked at 20 Hz without one. |
| `crew.ts` calls `loadEnv()` itself | A module-level side effect in a file whose tests must not reach the network, and a second place that decides what the env is. |
| **`RoomControls.postCrewChange`** | One more member on an interface the handler already holds. `FactoryRoom` implements it, calling `postCrewChange(this.env, …)` the way `storeRun` calls `postRun(this.env, run)` (`FactoryRoom.ts:321-338`) — it is the only file that already has `env` (`FactoryRoom.ts:67`). `crew.test.ts` injects a fake, the established pattern (`FactoryRoom.test.ts:25-43` builds a `Controls` that counts calls). §12's rule that nothing but `FactoryRoom` reaches outside the sim survives intact. |

The handler is synchronous and the write-through is not, so `onCrew` fires the promise and settles both outcomes inside `crew.ts`. `dispatchMessage` catches thrown exceptions (`handlers.ts:224-228`), but a rejected promise it never sees takes the process down with it — so the `.catch` is not optional, and test 8 is the one that fails if it is dropped.

The invite link is `mount.inviteUrl` — Laravel renders `route('factories.join', ['code' => $factory->join_code])`, which every member can already read on the factory screen (`show.blade.php:39`), so nothing new is exposed. `Join` gains `#[Url] public string $code` so the link prefills.

#### 7. Removal, and what the removed player sees

The evicted client gets, in order: `bye { reason: 'removed', text: 'You were removed from <factory>' }`, then `client.leave(CloseCode.CONSENTED, 'removed')` — both from the new `RoomControls.evict(sessionId, text)`. `Client.leave(code?, data?)` is Colyseus 0.18's signature (`@colyseus/core` `Transport.d.ts:207`), and `CONSENTED` (4000) is the code that means "this was not a network fault", so the SDK does not try to reconnect. Their seat is released by the room's existing chain (`releaseSeat`, `FactoryRoom.ts:314-320`: `releaseCarried` → `onPlayerLeft` → `removePlayer`), which drops whatever they were carrying and vacates the work tile they were standing on. `evictOtherTabs` already closes a socket exactly this way (`FactoryRoom.ts:309`), so the mechanism is proven in this codebase.

**The ordering, and why the client does not lean on it.** For a joined client with no `afterNextPatch` option, `client.send` reaches the wire immediately — `enqueueClientRaw` sends now via the transport's `raw` unless the frame is staged or the client has not finished joining (`@colyseus/core` `Transport.d.ts:308-323`) — and `client.leave` is `ref.close(code, data)` (`@colyseus/ws-transport/src/WebSocketClient.ts:65-67`), whose close frame the `ws` sender queues behind the data frame already on the same stream. So `bye` does arrive first. That is a library detail two dependencies deep, and F13 declines to hang a stale-token bug on it: **the close carries the reason too.** `Room.onLeave` is `(code: number, reason?: string)` (`@colyseus/sdk` `Room.d.ts:34-40`), so `Connection`'s handler clears the token on `reason === 'removed'` as well as on `FAILED_TO_RECONNECT` (`connection.ts:265-267`). A dropped `bye` then costs the player a sentence with the factory's name in it and nothing else: the token still goes, and the redirect still happens off the close.

The alternative considered was the client noticing it is no longer on the roster. It cannot: `world.members` is server-side and never in the schema, and `FactoryState.players` is keyed by session — the evicted player's own seat is gone before they could look. The close reason is the only carrier that cannot be lost separately from the close itself.

The client, on `bye` **or** on a consented close whose reason is `'removed'`: clears `sessionStorage[dynamite.reconnect.<factoryId>]` (`connection.ts:55-57`), shows the text over the canvas for two seconds, then `location.assign(mount.factoriesUrl)` — the **list**, not `factoryUrl`, because `factories.show` is behind `can:view` (`routes/web.php:20-22`) and they are no longer a member, so the factory screen would answer 403.

`world.members` loses the entry in the same step. That closes a real hole: the room checks membership once, at `onAuth`, against the list fetched at `onCreate` (`FactoryRoom.ts:294-301`), and a ticket is valid for 60 s (`IssueGameTicket.php:17`). Without the local removal, a player kicked at second 0 could re-join at second 30 with the ticket already sitting in their tab, because Laravel — which would now refuse to issue a new one — is never consulted again. With it, `onAuth` throws `'not a member'`.

Everyone else gets a `toast` `info`: `'<name> was removed from the crew'`. That is a functional string with a name in it, so it is code, not `copy.json` (contracts §14).

Promotion and demotion send nobody anywhere: the role badge changes on every client because `PlayerState.role` is a schema field.

#### 8. Leaving, and the owner leaving mid-shift

**Leave factory** removes the reconnect token, calls `room.leave()` (consented) and `location.assign(mount.factoryUrl)` — the same three steps F11's Report scene takes for BACK TO FACTORY (contracts §10.9), in that order and for the same reason: the token must go first, or a reload lands on a seat that has been released. A confirmation step guards it while `phase === 'running'` ("Leave mid-shift?"), because the button is two keypresses from `Esc`.

Because the leave is consented, `onLeave` skips `allowReconnection` (`FactoryRoom.ts:155-185`) and the seat is released immediately — no thirty-second ghost standing in front of the Slammer. It carries no close reason, which is what keeps it distinguishable from an eviction on the client (test 24).

**When the owner leaves mid-shift, the shift continues.** Concretely, and all of it existing behaviour F13 only has to not break:

- `recomputeHost` re-runs `chooseHost` (`FactoryRoom.ts:286-292`, `lobby.ts:47-66`), which prefers the owner's session and otherwise takes the earliest-joined connected player. Host passes to the longest-standing player present. `host` only gates `start` (`handlers.ts:175-188`), which is irrelevant to a day already running.
- The day still ends on its own terms — book, clock or explosion (contracts §10.7). `abandoned` is posted only when the room disposes *while running*, i.e. when the **last** client leaves (`FactoryRoom.ts:188-196`). One player staying is enough for the crew to finish, be graded, and have the run stored.
- The owner's `PlayerReport` still appears in the report: F11's metrics sampled them while they were seated, and the seat disappears when it is released. Their `utilization` is honestly low for the day. That is the correct number, not a bug.
- `StoreRun` advances `factories.day`, credits `coin` and raises `unlocked_level` on `ended`/`exploded` regardless of who was present (contracts §5) — the factory belongs to the factory, not to whoever is in the room.

The one thing that does change: an owner who left cannot be re-elected host by walking back in mid-shift, because the room locked at `start` (`FactoryRoom.ts:205`) and a fresh join is refused. They reconnect into their held seat only inside the thirty-second grace, and a consented leave forfeits that. Stated here so it is a decision rather than a surprise.

## Acceptance criteria

**Stage A**

- [ ] `Esc` at the Slammer or the Jig leaves the station, exactly as before; `Esc` on the floor or at the dock opens the menu; `Esc` again closes it.
- [ ] The menu lists Resume · Controls · Settings · Leave factory for a member, with Crew inserted for an owner or co-owner; ↑/↓ move, Enter/E choose.
- [ ] Controls shows the station-first rows from `helpContent.ts`, with no duplicated control text anywhere in F13.
- [ ] Opening the menu stops the avatar dead and does not stop the clock: the shift timer, a docked truck and a lit fuse all keep moving behind the panel.
- [ ] Volume, reduced motion, colourblind-safe palette and UI scale persist across a reload and are visibly applied; with the store unavailable the menu still opens on the defaults.
- [ ] Settings' lower half shows the level numbers the rungs produced and the line naming where they are set and that a change lands on the next room.
- [ ] Two players in one running room — one who joined in the lobby, one who reconnected mid-day — open Settings and read the same order book and truck interval.
- [ ] Leave factory returns to the factory screen with no reconnect token left behind; the crew's day continues and is graded and stored.

**Stage A, unticked until F14 lands**

- [ ] Settings names both rungs from `copy.difficulty.*`, read off `FactoryState.dexterity` / `pressure`, read-only; the placeholder line is gone.
- [ ] An owner changes Dexterity on the factory screen (F14's form); the next room's Settings panel names the new rung and shows the widened windows, and the order book is unchanged. Changing Pressure changes the book and leaves every window alone.

**Stage B**

- [ ] An owner promotes a member to co-owner: the badge changes on every client and in `factory_members`.
- [ ] An owner removes a player: that player lands on `/factories` with an explanation, everyone else gets a toast, the seat and anything it carried are released, and a reload with the still-valid ticket in the tab does not get them back in.
- [ ] A removed player whose `bye` never arrives still lands on `/factories` with no token left in `sessionStorage` — the close reason alone is enough.
- [ ] The invite link copies, and pasting it into a browser prefills the join code.

## Test plan

**game-server (vitest, `game-server/tests/crew.test.ts`, on `makeWorld({ members })`)**

1. `canManageCrew` / `canManageRoles` truth table over owner, co-owner, member, and a `userId` absent from `members`.
2. **Adversarial — a member forges a kick.** A non-owner sends `crew { op: 'remove', userId: <another member> }`: `postCrewChange` is never called, `world.members` and `state.players` are untouched, the target keeps their seat and their station, and the actor alone gets one `warn` toast.
3. **Adversarial — a co-owner attacks upward.** `remove` and `demote` aimed at the owner, and `remove` aimed at another co-owner, are refused; `promote` from a co-owner is refused.
4. **Adversarial — the owner removes themselves.** Refused; no message may leave a factory ownerless.
5. **Adversarial — the target is not a member of this factory.** A `userId` absent from `world.members` is refused before `postCrewChange` is called, so the message cannot be used to probe Laravel.
6. A valid removal: `postCrewChange` is called once with the actor's `userId`; on `{ ok: true }` the target is evicted, `releaseSeat` ran (a carried keg is on the floor, the work tile is free), `world.members` no longer lists them **and is the same array object it was before** (the in-place refill), and `evict` was called for that session and no other.
7. **Adversarial — the replayed ticket.** After a removal, `onAuth` with the target's unexpired ticket throws `'not a member'`.
8. `postCrewChange` resolves `{ ok: false, status: 500 }`: `world.members`, the roster and the seat are unchanged and the actor is toasted. Same for a **rejected** promise — and the process survives it, which is the assertion that fails if the `.catch` is dropped.
9. The cooldown drops a second `crew` message inside one second without a second `postCrewChange`.
10. `PlayerState.role` is written for every seated player on join and rewritten after a successful promote/demote; `connected` follows `setConnected` both ways.
11. Host handoff: the owner disconnects mid-shift → `state.host` becomes the earliest-joined connected player, `phase` stays `'running'`, no `endRequested` is raised. The last remaining client leaving still posts `abandoned`.

**game-server (vitest, the `laravel/api` suite)**

12. `postCrewChange` signs with the §5 canonical string (`POST` + `/internal/factories/7/crew` + the raw body), maps `200` to `{ ok: true, members }` with every `userId` coerced to a string, and maps `403` / `422` / `500` to `{ ok: false, status }` without throwing.

**Laravel (Pest)**

13. `UpdateCrewRole` promotes a member to `co_owner` and demotes back; both refuse when the target is the owner. **A `co_owner` pivot row saves and reads back** — the assertion that runs on every driver, because it is the behaviour that matters and SQLite's inline check is what enforces it there. Gated to `pgsql` via `DB::getDriverName()` and skipped otherwise: `factory_members_role_check` lists all three values after `up()`, and `down()` demotes every `co_owner` before narrowing.
14. `RemoveCrewMember` deletes the pivot row and refuses the owner.
15. **Adversarial — the unsigned internal call.** `POST /internal/factories/{id}/crew` with no signature → `401 { error: 'invalid_signature' }` (the existing middleware); with a valid signature but an `actorUserId` who is a plain member → `403`, and `factory_members` is unchanged; with a valid signature and an `actorUserId` who belongs to a *different* factory → `403`.
16. **Adversarial — the Livewire back door.** A member on the factory screen calls `Crew::remove` directly (`Livewire::actingAs($member)->test(...)->call('remove', $victim->id)`) → `AuthorizationException`, roster unchanged. The panel re-authorizes on every write, not only on `mount` — the trap `Show::updatedLevelId` already documents (`Show.php:36-41`).
17. `GET /internal/factories/{id}/config` includes a `role` on every member, and a `co_owner` is reported as one.
18. The invite URL prefills the join form and joins the right factory.

**Client (vitest)**

19. `escAction` truth table: menu open; overlay ate it; `press` station; `stand` station; floor. The `stand` row is the regression that keeps the dock playable.
20. `menuItems` omits `crew` for a member and includes it for owner and co-owner; `moveSelection` wraps at both ends.
21. `settingsStore` round-trips, coerces a corrupt payload to defaults, and returns defaults when `getItem`/`setItem` throw. A structural test asserts `settingsStore` is imported only by render and audio modules — a per-player setting must never be able to reach `send`.
22. Opening the menu emits exactly one zero-intent `input` and suppresses the heartbeat; closing it emits one send matching `keys.intent`.
23. The Settings panel renders the rung names from `conn.state.dexterity` / `conn.state.pressure` through `DEXTERITY_RUNGS` / `PRESSURE_RUNGS` and `copy.difficulty`, and the numbers from `conn.config.level`. With `copy.difficulty` absent it renders the placeholder line and still renders the numbers. Opening it sends exactly one `config` request and, when the reply arrives with a scaled `day.orderBook`, the panel shows the new number. No control on the panel sends anything at all.
24. **The dropped `bye`.** `Connection`'s `onLeave(CloseCode.CONSENTED, 'removed')` with no preceding `bye` clears the stored token; `onLeave(CloseCode.CONSENTED, undefined)` — an ordinary Leave factory, where the menu already cleared it — touches storage not at all rather than throwing.

**In the browser (before any box is ticked)**

25. Three sessions on one factory: the owner opens the menu mid-shift and the truck still leaves without them; the owner promotes the second player and removes the third; the third lands on `/factories` and cannot get back in; the remaining two finish the day and see a report card.

## Tasks

**Stage A — the menu**

1. `menuRouting.ts`, `menuItems.ts`, `settingsStore.ts` + tests 19–21; then `Menu.ts`, `SettingsPanel.ts` and `CrewPanel.ts`'s read-only roster + test 23.
2. `main.ts`, `mount.ts`, `play.blade.php`, `helpContent.ts` touches + test 22.
3. Browser pass on the menu, `Esc` routing, the Settings numbers and Leave factory; tick Stage A's boxes.

**Stage B — the crew**

4. Contracts v2.2 pass: the changes listed below, folded into the same edit as ADR 0014's and F14's.
5. The co-owner migration, `FactoryRole::CoOwner`, `FactoryPolicy::{manageCrew,manageRoles}`, the two Actions + tests 13–14.
6. `FactoryConfigController`: `members[].role`; the `api.ts` mapper + test 17.
7. `CrewController`, `CrewChangeRequest`, the route + tests 15–16 — adversarial cases first.
8. `shared/src/messages.ts` (`crew`, `bye`, `isCrewMsg`), `schema/types.ts` (`FactoryRoleName`) and the two `PlayerState` fields.
9. `api.ts`'s `postCrewChange` + test 12; the two `RoomControls` members in `handlers.ts` and `FactoryRoom.ts`; `makeWorld`'s `members` option.
10. `World.ts`'s three lines, then `game-server/src/rooms/crew.ts` + tests 1–11.
11. `connection.ts`'s three edits + test 24; `CrewPanel`'s three actions and the invite link.
12. `Livewire\Factories\Crew` + the one-line include in `show.blade.php`; `#[Url]` on `Join::$code` + test 18.
13. Browser pass with three sessions (25); tick the remaining boxes; update `docs/features/README.md`.

## Risks & open questions

- **A dial change needs a new room, and nothing tells the crew that.** ADR 0014's "read once at create" is right and F13 does not fight it, but the failure mode is a crew who change Dexterity, re-enter, and cannot tell whether it took. Mitigation: the Settings panel prints the resulting numbers, not only the rung, so "did it take" is answerable by looking. If that is not enough, the fix is Laravel invalidating the room over the seam — M4's Reverb work — not a message from this menu.
- **F13 depends on F14 for the labels on half of one panel.** `FactoryState.dexterity` / `pressure`, the two rung-name arrays and `copy.difficulty` are all F14's; until they land, `SettingsPanel` shows the player half, the level numbers, and one placeholder line. That is the correct dependency direction (the menu displays the dials, the dials do not know about the menu), and Stage A now ships without waiting on it — only two acceptance boxes do. **Resolved:** wave ordering no longer blocks F13 either way.
- **Rung 0 and "no rungs yet" look identical on the wire.** `FactoryState.dexterity` defaults to `0` under `@colyseus/schema` and to `2` under F14's contract change 6, and until F14 lands the field is absent entirely. The placeholder is the whole mitigation and it is a UI string, not a check — F13 cannot distinguish the two cases and does not pretend to. The case is gone once F14 has landed.
- **The migration is a no-op on the database the tests run against.** Postgres gets the widened constraint; SQLite gets nothing, because the create migration already emits the right one and SQLite could not alter it in any case. So the `up()` path is exercised only in production and in a `pgsql`-gated test, and a gate is the kind of thing that quietly stops running. Test 13's driver-agnostic half — a `co_owner` row saves and reads back — is what fails loudly, on any driver, if the enum and the constraint ever fall out of step.
- **Co-owner is one role, not a permission system.** The table in Behaviour §6 is deliberately coarse. If M4's payday vote or upgrade purchases need finer grants this becomes a permissions column and `crew` grows a scope; that is a rewrite of `crew.ts`'s checks, not of the seam.
- **`PlayerState.connected` duplicates `PlayerRuntime.connected`.** One fact, two homes, and the schema copy exists only for the roster. The alternative — inferring presence client-side from stalled positions — is worse, but the mirror must be written in `World.setConnected` and nowhere else or it will drift. **Resolved:** F13 owns that line and the `role` line beside it (see *World's three lines*), so there is one feature to blame when they drift.
- **A member can still read the invite link out of the DOM.** `data-invite-url` sits on the page for everybody, exactly as the join code sits on the factory screen today (`show.blade.php:39`). If invites ever need to be owner-only, the code moves out of the mount into an owner-only field on the `config` reply and the attribute goes away.
- **The crew write-through is the first server→Laravel call that blocks a game action.** `postRun` can be retried into the void; this one cannot. If Laravel latency makes removal feel broken, the answer is an optimistic eviction with a compensating re-admit — significantly more machinery, and only worth it with evidence.

## Contract changes required

Apply in the v2.2 pass. **F13 asks for nothing on account of the two dials.** It consumes three things F14 already requests — `FactoryState.dexterity` / `pressure` (F14's bullet 6), `DEXTERITY_RUNGS` / `PRESSURE_RUNGS` out of `shared/src/sim/difficulty.ts` (F14's bullet 4) and the `copy.difficulty` section (F14's bullet 11) — and needs no widening of §4, which stays `ConfigMsg = { level; layout; copy }`. ADR 0014's and F14's remaining bullets (the `difficulty` key on the config response, `RunPayload.difficulty`, the `factories` columns, the tempo floors) are theirs and are not repeated here.

1. **§3 `PlayerState`** — add `connected b`. Writer: **F13** (a Touch on F03's `World.addPlayer`, which sets `true`, and on `World.setConnected`, which mirrors, `World.ts:300-302`). Schema default `false`. Read only by F13's crew roster.
2. **§3 `PlayerState`** — add `role s ('owner'|'co_owner'|'member')`. Writer: **F13**. Schema default `'member'`. Set in `World.addPlayer` from `world.members` / `factory.ownerUserId`, rewritten by `crew.ts`. Add the union as `FactoryRoleName` to `shared/src/schema/types.ts` (F02, one line).
3. **§3 writers-by-field** — one new entry: `F13 — PlayerState.{connected role}`. Both fields, not one each to F03 and F13; an earlier draft split them and left it open.
4. **§4 client→server** — one row: `crew` · `{ op: 'promote'|'demote'|'remove', userId: string }` · owner/co-owner crew change; refused to anyone else with a `warn` toast. Add `crew` to `ClientMsg`, and `CrewOp`, `CrewMsg`, `isCrewMsg` to the §4 code block.
5. **§4 server→client** — one row: `bye` · `{ reason: 'removed', text: string }` — sent to one client immediately before the room closes its socket with `CONSENTED` and the close reason `'removed'`. The close reason is the authoritative signal; `bye` carries only the text. Add `bye` to `ServerMsg` and `ByeMsg` to the §4 code block.
6. **§5** — one row in the call table: `POST /internal/factories/{id}/crew` · node · body `{ actorUserId, op, userId }` → `200 { ok: true, members: [{ userId, name, role }] }`; `403 { error: 'forbidden' }`; `422`. Amend the existing `GET /internal/factories/{id}/config` row: every `members[]` entry gains `role: 'owner'|'co_owner'|'member'`.
7. **§6 mount** — two attributes, making eight: `data-invite-url="{{ route('factories.join', ['code' => $factory->join_code]) }}"` and `data-factories-url="{{ route('factories.index') }}"`. `readMount` returns `MountData { …, inviteUrl, factoriesUrl }`; change "exactly those six attributes" to eight.
8. **§10.1 `World`** — `readonly members` entries gain `role: FactoryRoleName`; `WorldInit.config` (`FactoryConfigResponse`) carries it. The property stays `readonly`: consumers refill it in place.
9. **§10.1 `RoomControls`** — two members: `evict(sessionId: string, text: string): void` (sends `bye` to that client, then closes its socket with `CloseCode.CONSENTED` and the close reason `'removed'`) and `postCrewChange(actorUserId: string, op: CrewOp, userId: string): Promise<CrewResult>`. Both implemented by `FactoryRoom`'s `controls` object (F03's file, F13's Touch) and called only by F13. Update §10.1's inline `RoomControls { startDay(); sendConfig(sessionId) }`, and note in §11 that `crew` is the first handler to start a promise and settles it itself.
10. **§10.1, `game-server/src/laravel/api.ts` exports** — add `postCrewChange(env, factoryId, change, fetchImpl?)`, `CrewChange`, `CrewMember`, `CrewResult` to the list beside `fetchFactoryConfig` / `postRun`. It signs with the same §5 canonical string and never throws on a non-2xx: `{ ok: false, status }`.
11. **§10.1 test helper** — `MakeWorldOptions` gains `members?: Array<{ userId: string; name: string; role: FactoryRoleName }>`, default `[]`. `makeWorld` hard-codes `members: []` today (`tests/helpers/world.ts:33-40`), and without the option no crew test can build a world that has an owner in it.
12. **§11 dispatch table** — one row: `crew` → `crew.onCrew` (entry owner F13). A `handlers.ts` touch, like F05's and F06's.
13. **§12 ownership** — a new row: *Menu, settings, crew* · `resources/js/game/ui/{Menu,menuItems,menuRouting,settingsStore,CrewPanel,SettingsPanel}.ts`, `game-server/src/rooms/crew.ts`, `app/Livewire/Factories/Crew.php` + its view, `app/Actions/{UpdateCrewRole,RemoveCrewMember}.php`, `app/Http/Controllers/Internal/CrewController.php`, `app/Http/Requests/CrewChangeRequest.php`, the co-owner migration, their tests · **F13** · Touches: the sixteen listed in this doc's header. **Four existing rows must carve F13's files out of their globs, or the new row contradicts them:**
    - F01's row (`app/**`, `routes/**`, `database/**`, `resources/views/**`, `tests/**`) — Touches column gains F13's Laravel files, the way it already lists F12's.
    - F02's row — Touches column gains F13: `messages.ts`, `schema/PlayerState.ts`, `schema/types.ts`.
    - F03's row (which lists `rooms/` and `sim/World.ts`) — `rooms/crew.ts` is F13's; Touches column gains F13: `World.ts` (three edits), `handlers.ts`, `FactoryRoom.ts`, `laravel/api.ts`, `tests/helpers/world.ts`.
    - F04's row (which lists `ui/`) — the six `ui/` files above are F13's; Touches column gains F13: `main.ts`, `mount.ts`, `net/connection.ts`, `ui/helpContent.ts`.

## F18 audio, and what it means for this doc (2026-09-10)

F18 shipped audio in M1, ahead of this doc's settings panel, so two lines here are already out
of date:

- The Out-of-scope line excluding "music and SFX beyond F07's Slammer audio" now means **music
  only**. Every cue the game makes is F18's table, shipped and owned.
- `volume` and `muted` have a consumer from M1. F18 reads and writes exactly those two keys out
  of this doc's own `dynamite.settings` blob, through a merge that preserves `reducedMotion`,
  `colourSafe` and `uiScale`, and keeps its reader and writer private to `audio/Audio.ts`. So
  F13's arrival is a deletion of that private pair, not a migration.

F13 still owns `settingsStore.ts`, `SettingsPanel.ts` and the `PlayerSettings` type. Until it
lands, the controls are keys: `M` mutes, `[` and `]` move the level, and the HUD's top band
shows it. When the panel arrives those keys should stay — a mute you have to open a menu for is
a mute nobody reaches in time.
