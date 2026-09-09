# F01 — Laravel foundation: accounts, factories, levels, game page, internal API
**Status:** [x] Design reviewed · [x] Implemented · [x] Unit tests green · [x] Verified in the running app
**Owns:** `app/` · `routes/` · `database/` · `resources/views/` (incl. `resources/views/play.blade.php`; F04 owns the mount contract) · `config/` except `config/game/**` (F12's levels, layouts and `copy.json`) · `tests/` · `bootstrap/app.php` · `composer.json` · `.env.example` · `resources/js/app.js` · root `package.json` (F04 adds client deps and scripts) · `vite.config.js` (F04 adds the game entry and alias)
**Touched by F12** (contracts §12): `Level::isSandbox()`, `Level::isUnlockedFor()`, `PlayController`'s `$debug`, `LevelFactory::sandbox()`, `tests/Feature/Levels/*`.
**Reads:** `docs/features/00-contracts.md` (v2 — binding) · `docs/11-architecture.md` · `docs/12-data-model.md` · `docs/18-days-grades-and-payday.md` (persistence) · `docs/09-progression.md` · `docs/13-config-schema.md` · `docs/19-scaling-3-to-10.md` · `docs/decisions/0007-livewire-flux-shell.md` · `docs/14-roadmap.md`

## Goal

A player registers, creates a factory (or joins a friend's with a six-character code), opens the factory screen, sees who is in it and which levels are unlocked, picks a level, and clicks **Enter factory** — which lands on a page that hands the Phaser client everything it needs to fetch a signed ticket and join the room. When the day ends, the game server posts the run to Laravel and it appears in the factory's run history with its grade, profit, and coin; the factory's day and coin advance. An admin (`is_admin`) can list the levels, toggle them on and off, and edit a level's JSON in the browser with schema validation, and an operator can re-seed levels from disk with `php artisan game:levels:sync`. The game server talks to Laravel through two HMAC-signed internal endpoints and never sees the database.

## Scope

**In (M1):**
- `users.is_admin`; auth pages, layouts and Flux from the Livewire starter kit, untouched.
- Root `package.json` with `"workspaces": ["shared", "game-server"]` (contracts §1) so `@colyseus/schema` hoists to one copy; `composer.json` (`opis/json-schema`, `dev` script without `serve`); `.env.example` with the contracts §2 keys; `vite.config.js` with the `app.js` entry.
- Migrations and models: `factories`, `factory_members`, `factory_upgrades`, `levels`, `runs`, `run_players`.
- Actions: `CreateFactory`, `JoinFactoryByCode`, `IssueGameTicket`, `StoreRun`, `SyncLevelsFromDisk`.
- Livewire class components: factories index / create / join / show; admin levels index / edit.
- Routes: `POST /game/ticket`; `GET /internal/factories/{factory}/config`; `POST /internal/runs`; the HMAC middleware; `GET /factories/{factory}/play` rendering `play.blade.php` per contracts §6.
- `config/game.php`; Artisan `game:levels:sync`; dev seeder (two users, one shared factory).
- `runs` persistence (contracts §5 "Run store"): store the run and its players, credit `factories.coin`, advance `factories.day`, and raise `factories.unlocked_level` — capped at the highest active `sort` — when the grade meets the level's `grading.advanceOn` (pulled forward from M4 because it is one comparison and without it `unlocked_level` is a dead column — see Risks).
- Pest feature tests for ticket issuance, HMAC rejection, config endpoint shape, run storage, join by code, level sync, admin editor.

**Out (later milestones):**
- Payday vote, purchases, `factory_upgrades` writes, applying upgrade patches in the config endpoint — **M4**. (`factory_upgrades` gets its migration and model now because the task fixes the schema early; nothing reads or writes it in M1.)
- Reverb presence, invites, live tallies, `DayEnded` broadcast — **M4**.
- Corkboard of report cards, force-end a stuck run, admin factory/run lists — **M4**.
- Per-breakpoint layouts and a real use of `?players=N` — **M2**. Contracts §8: "Laravel keeps one layout per level in M1"; Node applies `scaleLevel()` (see Risks).
- Repeat-the-day banner ("MANAGEMENT WOULD LIKE TO SEE IMPROVEMENT") — **M4**. In M1 `day` is a calendar counter that always advances after a finished run.
- Sandbox is a level file, not a mode: `sandbox.json` with `day.endsOn === 'never'` is F12's, and F12 touches `Level::isSandbox()`, `Level::isUnlockedFor()`, `PlayController`'s `$debug` and `LevelFactory::sandbox()` in F01's files (contracts §5, §6, §12). A Sandbox day is never posted to `POST /internal/runs`, so it never advances `day`, `coin` or `unlocked_level`.

## Design

### Files

| Path | Responsibility |
|---|---|
| `package.json` (root) | `"private": true`, `"workspaces": ["shared", "game-server"]` (contracts §1); F04 appends the client deps and the `test:client` script |
| `composer.json` | add `opis/json-schema:^2.4` (PHP JSON Schema validator, draft-07 support); `dev` script runs `vite` + `queue:listen` only — Herd serves `https://dynamite.test` (contracts §2) |
| `.env.example` | `DB_CONNECTION=pgsql`, `DB_HOST`, `DB_PORT`, `DB_DATABASE=dynamite`, `DB_USERNAME`, `DB_PASSWORD`, `GAME_SERVER_URL`, `GAME_SERVER_WS_URL`, `GAME_SERVER_SECRET` with the contracts §2 values |
| `vite.config.js` | the `resources/js/app.js` entry; F04 adds `resources/js/game/main.ts` and the `@shared` alias |
| `config/game.php` | `server_url`, `ws_url`, `secret`, `levels_path`, `layouts_path`, `schema_path` |
| `bootstrap/app.php` | register `routes/internal.php` under `EnsureGameServerSignature` (no `web` group); render JSON for every exception under `internal/*` |
| `routes/web.php` | auth'd player routes, `game.ticket`, admin routes, `dashboard` → redirect to `factories.index` |
| `routes/internal.php` | the two node-facing routes |
| `database/migrations/…_add_is_admin_to_users_table.php` | `is_admin boolean default false` |
| `database/migrations/…_create_levels_table.php` | `levels` |
| `database/migrations/…_create_factories_table.php` | `factories` (after `levels`: `level_id` FK) |
| `database/migrations/…_create_factory_members_table.php` | `factory_members` |
| `database/migrations/…_create_factory_upgrades_table.php` | `factory_upgrades` |
| `database/migrations/…_create_runs_table.php` | `runs` (contracts §5: `grade`, `profit`, `coin_earned`, `ended_at` NOT NULL; unique `(factory_id, seed, started_at)`) |
| `database/migrations/…_create_run_players_table.php` | `run_players` |
| `database/factories/FactoryFactory.php` | model factory for `App\Models\Factory`; imports `Illuminate\Database\Eloquent\Factories\Factory as EloquentFactory` to dodge the name clash |
| `database/factories/LevelFactory.php` | builds a `Level` from `tests/Fixtures/game/levels/level-01-basic-flow.json` + `layouts/one-line.json`; state `inactive()`; F12 adds `sandbox()` |
| `database/factories/RunFactory.php` | a finished run with a fixture `metrics` payload; states `grade(string)`, `status(RunStatus)` |
| `database/seeders/DatabaseSeeder.php` | sam / priya / the shared factory (idempotent `firstOrCreate`) |
| `app/Models/User.php` | `is_admin` cast; `factories()` |
| `app/Models/Factory.php` | relationships, `isMember()`, `effectiveLevel()` |
| `app/Models/Level.php` | `JsonObject` casts for `config` and `layout`; `scopeActive()`; `isUnlockedFor()`; F12 adds `isSandbox()` and its clause in `isUnlockedFor()` |
| `app/Models/Run.php` | casts; `players()` pivot with `stats` |
| `app/Models/FactoryUpgrade.php` | model only (M4 writes it) |
| `app/Enums/FactoryRole.php` | `Owner = 'owner'`, `Member = 'member'` |
| `app/Enums/RunStatus.php` | `Ended = 'ended'`, `Exploded = 'exploded'`, `Abandoned = 'abandoned'` (contracts §9 `RunStatus`) |
| `app/Casts/JsonObject.php` | jsonb ⇄ `stdClass` cast that preserves `{}` (see Behaviour §B7) |
| `app/Game/InternalSignature.php` | `sign()` — the one place the canonical string is built |
| `app/Game/LevelSchemaValidator.php` | wraps `Opis\JsonSchema\Validator`; returns pointer-keyed errors |
| `app/Exceptions/UnknownJoinCode.php` | thrown by `JoinFactoryByCode` |
| `app/Exceptions/InvalidLevelFile.php` | thrown by `SyncLevelsFromDisk`; carries `file` and `errors` |
| `app/Actions/CreateFactory.php` | create + owner membership + join code |
| `app/Actions/JoinFactoryByCode.php` | normalise code, attach member |
| `app/Actions/IssueGameTicket.php` | build and sign the ticket |
| `app/Actions/StoreRun.php` | persist run + players; credit coin; advance day; unlock (capped) |
| `app/Actions/SyncLevelsFromDisk.php` | validate then upsert every level file |
| `app/Policies/FactoryPolicy.php` | `view(User, Factory)` = membership (auto-discovered) |
| `app/Providers/AppServiceProvider.php` | `Gate::define('admin', …)` |
| `app/Http/Middleware/EnsureGameServerSignature.php` | verifies `X-Dynamite-Signature` |
| `app/Http/Controllers/GameTicketController.php` | `POST /game/ticket` |
| `app/Http/Controllers/PlayController.php` | `GET /factories/{factory}/play` |
| `app/Http/Controllers/Internal/FactoryConfigController.php` | `GET /internal/factories/{factory}/config` |
| `app/Http/Controllers/Internal/StoreRunController.php` | `POST /internal/runs` |
| `app/Http/Requests/StoreRunRequest.php` | validation rules for `RunPayload` (contracts §9) |
| `app/Console/Commands/SyncLevels.php` | `game:levels:sync` |
| `app/Livewire/Factories/Index.php` + `resources/views/livewire/factories/index.blade.php` | my factories list |
| `app/Livewire/Factories/Create.php` + `…/factories/create.blade.php` | name form |
| `app/Livewire/Factories/Join.php` + `…/factories/join.blade.php` | code form |
| `app/Livewire/Factories/Show.php` + `…/factories/show.blade.php` | members, join code, level select, Enter factory, run history |
| `app/Livewire/Admin/Levels/Index.php` + `…/admin/levels/index.blade.php` | level list with `is_active` switch |
| `app/Livewire/Admin/Levels/Edit.php` + `…/admin/levels/edit.blade.php` | JSON textarea, Validate, Save |
| `resources/views/play.blade.php` | standalone page with the contracts §6 mount div (six `data-*` attributes) |
| `resources/views/components/layouts/app/sidebar.blade.php` | starter-kit sidebar: add **Factories** link and, for admins, **Levels** (only edit to a kit file) |
| `tests/Fixtures/game/level.schema.json` | permissive JSON Schema (draft-07) used by the unit and feature tests: accepts F02's `level-m1.json`, requires `key`/`name`/`layout` strings and a numeric `clipboardSeconds`. Not F02's schema — the tests must not wait on it |
| `tests/Fixtures/game/levels/level-01-basic-flow.json` | verbatim copy of `shared/tests/fixtures/level-m1.json` (F02) with `key` renamed to the stem; `recipes.keg.inputs` is `{}`, which is the point of `JsonObject` |
| `tests/Fixtures/game/levels/level-02-too-much-powder.json` | the same copy with `key` and `name` changed, so the sync's file ordering and `sort` are exercised |
| `tests/Fixtures/game/layouts/one-line.json` | verbatim copy of `shared/tests/fixtures/layout-one-line.json` (F02); its `key` `one-line` is the `layout` both level fixtures name |
| `tests/Fixtures/game/run.json` | a full `RunPayload` (contracts §9) for run tests and the curl smoke test: `factoryId` a string, ISO-8601 UTC `startedAt`/`endedAt`, integer `pnl.profit`/`pnl.coin`, `players[]` of `PlayerReport`s |
| `tests/Unit/Casts/JsonObjectTest.php`, `tests/Unit/Game/LevelSchemaValidatorTest.php`, `tests/Unit/Game/InternalSignatureTest.php` | unit tests |
| `tests/Feature/Game/TicketTest.php`, `tests/Feature/Internal/SignatureTest.php`, `tests/Feature/Internal/FactoryConfigTest.php`, `tests/Feature/Internal/StoreRunTest.php`, `tests/Feature/Factories/{CreateFactoryTest,JoinByCodeTest,ShowTest,IndexTest}.php`, `tests/Feature/PlayPageTest.php`, `tests/Feature/Admin/LevelEditorTest.php`, `tests/Feature/Console/SyncLevelsTest.php`, `tests/Feature/SeederTest.php` | feature tests |

Every PHP file: `declare(strict_types=1)`, explicit types, Pint-formatted. Controllers are one public method. Blade uses Flux free components (`flux:button`, `flux:input`, `flux:textarea`, `flux:select`, `flux:switch`, `flux:badge`, `flux:heading`, `flux:callout`, `flux:field`/`label`/`error`); lists are plain `<table>` with Tailwind because `flux:table` is Pro.

### Interfaces

**Consumes**
- Livewire starter kit: `App\Models\User` (`name`, `email`, `password`), routes `login`, `register`, `dashboard`, `profile`; the app layout referenced by `config('livewire.layout')`; `resources/js/app.js` and `vite.config.js` as the installer wrote them.
- `shared/src/config/schema.json` (F02, contracts §8): a single self-contained **draft-07** document (no external `$ref`) describing one `LevelConfig`. Loaded from `config('game.schema_path')`.
- `config/game/levels/<key>.json` and `config/game/layouts/<layout>.json` (F12, contracts §8): one `LevelConfig` per file whose `key` equals the file stem and whose `layout` string names a file in the layouts directory; the layout JSON's `key` equals its stem. M1 ships `level-01-basic-flow`, `level-02-too-much-powder`, `level-03-the-bottleneck`, `level-04-too-many-helpers`, `sandbox`, and the single layout `mvp-small`.
- `resources/js/game/main.ts` (F04) via `@vite`.
- `RunPayload` (contracts §9) as posted by the game server (F03 posts; F11 builds it), with the field types pinned below.
- `opis/json-schema` `^2.4`: `Opis\JsonSchema\Validator::validate(mixed $data, string|object $schema): Opis\JsonSchema\ValidationResult`, `Opis\JsonSchema\Errors\ErrorFormatter::format(ValidationError $error): array<string, list<string>>` (keys are JSON pointers into the data).

**Produces**

Routes (names are the contract for links and for `main.ts`):

| Method · path | Name | Middleware | Handler |
|---|---|---|---|
| `GET /factories` | `factories.index` | `auth` | `Livewire\Factories\Index` |
| `GET /factories/create` | `factories.create` | `auth` | `Livewire\Factories\Create` |
| `GET /factories/join` | `factories.join` | `auth` | `Livewire\Factories\Join` |
| `GET /factories/{factory}` | `factories.show` | `auth`, `can:view,factory` | `Livewire\Factories\Show` |
| `GET /factories/{factory}/play` | `factories.play` | `auth`, `can:view,factory` | `PlayController` |
| `POST /game/ticket` | `game.ticket` | `auth` (+ `web` CSRF) | `GameTicketController` |
| `GET /admin/levels` | `admin.levels.index` | `auth`, `can:admin` | `Livewire\Admin\Levels\Index` |
| `GET /admin/levels/{level}/edit` | `admin.levels.edit` | `auth`, `can:admin` | `Livewire\Admin\Levels\Edit` |
| `GET /dashboard` | `dashboard` | — | `Route::redirect` to `/factories` (keeps the kit's post-login target name) |
| `GET /internal/factories/{factory}/config` | `internal.factories.config` | `EnsureGameServerSignature` | `Internal\FactoryConfigController` |
| `POST /internal/runs` | `internal.runs.store` | `EnsureGameServerSignature` | `Internal\StoreRunController` |

`POST /game/ticket` — request `{ "factory_id": 7 }` (JSON, with `X-CSRF-TOKEN` from `data-csrf` and `Accept: application/json`; an unauthenticated JSON request gets 401, a non-JSON one a 302 to login). Response `200 { "ticket": string, "ws_url": string, "room": "factory" }`. `422` when `factory_id` is missing or not a factory; `403` when the user is not a member.

Ticket format (contracts §5): `base64url(json) + '.' + hex(hmac_sha256(secret, base64url(json)))` where the JSON object is `{ "userId": <int>, "factoryId": <int>, "name": <string>, "exp": <int unix seconds, now + 60> }`. `base64url` is standard base64 with `+`→`-`, `/`→`_`, padding stripped. HMAC hex is lowercase. `name` is `mb_substr(trim($user->name), 0, 32)` because Node's `verifyTicket` rejects a name outside 1–32 characters after trim.

Signature (contracts §5), canonical string built by `App\Game\InternalSignature::sign(string $method, string $path, string $body, string $secret): string`:
`strtoupper(method) . path . body` with **no separators**, where `path` is the URL path only (no scheme, host or query string: `/internal/factories/7/config`) and `body` is the raw request bytes exactly as sent (empty string for GET). Header `X-Dynamite-Signature: <lowercase hex>`; the middleware lowercases the header before `hash_equals`. Failure → `401 { "error": "invalid_signature" }`. Node builds the same string in `signRequest(method, path, body, secret)`.

`GET /internal/factories/{factory}/config?players=N` → `200`:
```json
{
  "factory": { "id": 1, "name": "Kaboom & Sons", "day": 1, "coin": 0, "ownerUserId": 1 },
  "level":   { "...": "levels.config verbatim (a JSON object)" },
  "layout":  { "...": "levels.layout verbatim (a JSON object)" },
  "members": [ { "userId": 1, "name": "Sam" }, { "userId": 2, "name": "Priya" } ]
}
```
`players` is optional, `integer|between:1,10` → `422` otherwise; it is validated and not branched on in M1. `404 { "error": "not_found" }` for an unknown factory; `404 { "error": "no_active_level" }` when the factory has no playable level. `ownerUserId` (`factories.owner_id`) and `members[].userId` are JSON integers on the wire; Node coerces both to strings. Laravel returns `levels.config` verbatim — Node validates it, applies the contracts §13 defaults and scales it.

`POST /internal/runs` body = `RunPayload`. Laravel validates and reads the fields below and stores the whole body as `runs.metrics`:

| Field | Rule |
|---|---|
| `factoryId` | `required, integer, exists:factories,id` — sent as a string (contracts §9); the `integer` rule accepts a numeric string |
| `levelKey` | `required, string, exists:levels,key` |
| `day` | `required, integer, min:1` |
| `seed` | `required, integer` (fits `bigint`) |
| `startedAt`, `endedAt` | `required, date` — ISO-8601 UTC strings (`2026-09-04T20:15:00.000Z`); `endedAt` ≥ `startedAt` |
| `status` | `required, in:ended,exploded,abandoned` |
| `grade` | `required, in:A,B,C,D,F` |
| `score` | `required, numeric` |
| `pnl.profit`, `pnl.coin` | `required, integer` (`coin` also `min:0`) — whole coin; F02's `profitAndLoss` rounds |
| `players` | `present, array`; each `userId` (`required`, and an integer or a string — contracts §9 types it `string`, dev joins send `dev-<name>`, and an array or object would be `(int)`-cast onto an account it has nothing to do with, so a non-scalar is a `422`), `name` (`required, string`), `utilization` (`required, numeric`), `label` (`required, string`) |

Response `201 { "ok": true, "runId": 12 }` on insert; `200 { "ok": true, "runId": 12 }` with the existing id when the same `(factoryId, seed, startedAt)` was already stored (game-server retries are idempotent); `422` on validation failure.

PHP surface other features or tests will call:
```php
App\Actions\CreateFactory::handle(User $owner, string $name): Factory
App\Actions\JoinFactoryByCode::handle(User $user, string $code): Factory   // throws App\Exceptions\UnknownJoinCode
App\Actions\IssueGameTicket::handle(User $user, Factory $factory): string
App\Actions\StoreRun::handle(array $payload): Run                          // $payload = validated RunPayload
App\Actions\SyncLevelsFromDisk::handle(): array{created: list<string>, updated: list<string>}   // throws App\Exceptions\InvalidLevelFile
App\Game\LevelSchemaValidator::errors(object $config): array<string, list<string>>   // [] when valid; keys are JSON pointers
App\Game\InternalSignature::sign(string $method, string $path, string $body, string $secret): string
App\Models\Factory::isMember(User $user): bool
App\Models\Factory::effectiveLevel(): ?Level       // level_id's level if active, else lowest-sort active level
App\Models\Level::isUnlockedFor(Factory $factory): bool   // F01: sort <= unlocked_level; F12 prepends isSandbox() ||
App\Models\Level::isSandbox(): bool                       // F12's touch: config.day.endsOn === 'never' (contracts §5)
App\Models\Level::scopeActive(Builder $query): void
```

Blade mount (`resources/views/play.blade.php`) — exactly contracts §6, inside a standalone full-bleed page (no app layout, `body { margin: 0; background: #000 }`, `#game { width: 100vw; height: 100vh }` so the client can fit the canvas with `Scale.FIT`, centred):
```html
<div id="game" data-ticket-url="{{ route('game.ticket') }}" data-factory-id="{{ $factory->id }}"
     data-ws-url="{{ config('game.ws_url') }}" data-csrf="{{ csrf_token() }}" data-debug="{{ $debug ? 1 : 0 }}"
     data-factory-url="{{ route('factories.show', $factory) }}"></div>
@vite('resources/js/game/main.ts')
```
F04's `readMount` parses exactly those six attributes; `data-factory-url` is where the Report scene's BACK TO FACTORY goes.

Artisan: `php artisan game:levels:sync` — prints one line per level (`created level-01-basic-flow` / `updated …`), exit 0; on any invalid file prints `<file>: <pointer>: <message>` lines and exits 1 without writing.

Level file rules for F12 (enforced by the sync): file `config/game/levels/<key>.json` where `<key>` equals the JSON `key`; `levels.sort` is the 1-based position of the file in the lexically sorted directory listing (so `level-01-…` … `level-04-…`, then `sandbox`, order the campaign); `layout` names `config/game/layouts/<layout>.json`, whose `key` equals its stem.

### Data & config

`config/game.php`:

| Key | Value | Read by |
|---|---|---|
| `server_url` | `env('GAME_SERVER_URL', 'http://127.0.0.1:2567')` | nothing in M1 (declared in contracts §2; M4 force-end is the first reader — see Risks) |
| `ws_url` | `env('GAME_SERVER_WS_URL', 'ws://127.0.0.1:2567')` | `GameTicketController`, `play.blade.php` |
| `secret` | `env('GAME_SERVER_SECRET', '')` | `IssueGameTicket`, `EnsureGameServerSignature` — both throw `RuntimeException('GAME_SERVER_SECRET is not set')` when empty |
| `levels_path` | `base_path('config/game/levels')` | `SyncLevelsFromDisk` |
| `layouts_path` | `base_path('config/game/layouts')` | `SyncLevelsFromDisk` |
| `schema_path` | `base_path('shared/src/config/schema.json')` | `LevelSchemaValidator` |

Note: Laravel's config loader only picks up `*.php` under `config/`, so `config/game.php` and the `config/game/*.json` directory coexist. Never put a `.php` file under `config/game/` — it would be merged into the `game` key.

Constants owned by this feature (not designer-tunable, so they live in code): ticket TTL **60 s** (contracts §5); ticket `name` cap **32** characters (Node's `verifyTicket` bound, contracts §5); join code **6** characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I); run history shows the latest **20** runs; grade order for the unlock comparison **A < B < C < D < F**.

Level-config keys read by Laravel: `key` (string), `name` (string), `layout` (string), `grading.advanceOn` (`'A'|'B'|'C'|'D'`, optional; default `"C"` per contracts §13 — Laravel applies the default itself because it stores the file verbatim and Node is the one that runs `validateLevelConfig`), and `day.endsOn` (only through F12's `Level::isSandbox()`). Everything else is opaque.

Schema (Postgres; `timestampTz` for all timestamps):

| Table | Columns |
|---|---|
| `users` | + `is_admin boolean not null default false` |
| `levels` | `id` · `key string unique` · `name string` · `sort integer` (index) · `config jsonb` · `layout jsonb` · `is_active boolean default true` · timestamps |
| `factories` | `id` · `owner_id → users (restrictOnDelete)` · `name string` · `join_code string(6) unique` · `level_id → levels nullable (nullOnDelete)` · `coin integer default 0` · `day integer default 1` · `unlocked_level integer default 1` · timestamps |
| `factory_members` | `factory_id → factories (cascade)` · `user_id → users (cascade)` · `role enum('owner','member')` · pk `(factory_id, user_id)` |
| `factory_upgrades` | `factory_id → factories (cascade)` · `upgrade_key string` · `purchased_at timestampTz` · `day integer` · pk `(factory_id, upgrade_key)` |
| `runs` | `id` · `factory_id → factories (cascade)` · `level_id → levels (restrict)` · `day integer` · `seed bigint` · `started_at` · `ended_at` · `status enum('ended','exploded','abandoned')` · `grade char(1)` · `profit integer` · `coin_earned integer` · `metrics jsonb` · timestamps · unique `(factory_id, seed, started_at)`. `grade`, `profit`, `coin_earned`, `ended_at` are NOT NULL (contracts §5) |
| `run_players` | `run_id → runs (cascade)` · `user_id → users (cascade)` · `stats jsonb` · pk `(run_id, user_id)` |

Deviations from `docs/12` and why: `factories.level_id` is new — the ticket carries no level, so Laravel must remember which level the room should run. `runs.status` follows contracts §9 (`ended|exploded|abandoned`) rather than doc 12's `running|ended|abandoned`: Laravel only ever hears about finished runs. `levels.layout` is new (the config endpoint returns the layout, so the sync stores it beside the config).

Seeder (`php artisan migrate:fresh --seed`): users **Sam** `sam@example.com` (`is_admin = true`) and **Priya** `priya@example.com`, both password `password`; factory **Kaboom & Sons**, `join_code = BANG42`, owner Sam, member Priya, `unlocked_level = 4` (M1 ships levels 1–4 and the playtest factory must reach all of them; Sandbox needs no unlock because `isUnlockedFor()` short-circuits on `isSandbox()`), `level_id = null`. Levels are not seeded — run `php artisan game:levels:sync` after seeding (it needs F02's schema and F12's files).

Tests run on the starter kit's SQLite in-memory connection: `jsonb` becomes `text`, `enum` becomes a check constraint. Nothing in F01 uses jsonb operators, so parity with Postgres holds.

### Behaviour

**B1 — Create factory** (`CreateFactory`, called from `Livewire\Factories\Create` after `name: required|string|min:2|max:40`). In one transaction: insert the factory with `owner_id = user`, `name`, a fresh `join_code`, `coin 0`, `day 1`, `unlocked_level 1`, `level_id null`; attach the owner in `factory_members` with `role = owner`. Join code: 6 random characters from the alphabet above (`random_int` per character); if `factories.join_code` already holds it, generate again, up to 5 attempts, then throw `RuntimeException`. Redirect to `factories.show`.

**B2 — Join by code** (`JoinFactoryByCode`, from `Livewire\Factories\Join` after `code: required|string`). Normalise: uppercase, strip whitespace and hyphens (`bang 42` → `BANG42`). Look up `join_code`; not found → throw `UnknownJoinCode`, which the component turns into `addError('code', 'No factory has that code.')`. Already a member → return the factory unchanged (idempotent). Otherwise attach with `role = member`. Membership is uncapped; the room's `maxClients = level.players.max` (contracts §5) bounds concurrent players, not members. Redirect to `factories.show`.

**B3 — Factory screen** (`Livewire\Factories\Show`, `mount(Factory $factory)`; the `can:view,factory` middleware has already enforced membership). Renders: name, day, coin; members ordered owner first then by name, each with a `flux:badge` for the role; the join code in monospace with an Alpine copy button (`navigator.clipboard.writeText`); the level select; **Enter factory** as a link to `factories.play` (disabled with the text "Sync levels first" when `effectiveLevel()` is null); run history — the latest 20 runs by `ended_at desc`, columns Day · Level · Grade · Status · Profit · Coin · Ended.
Level select: a `flux:select` bound to `levelId` (`wire:model.live`) listing every `Level::active()->orderBy('sort')` level; options where `isUnlockedFor($factory)` is false are `disabled` and suffixed " — locked". Initial value = `effectiveLevel()?->id`. `updatedLevelId(int $id)` re-checks that the level is active and `isUnlockedFor($factory)` (else `addError('levelId', 'That level is locked.')` and revert) then saves `factories.level_id`. Any member may change it. Sandbox is never locked once F12's `isSandbox()` clause is in place.

**B4 — Play page** (`PlayController`). Guard: if `effectiveLevel()` is null, redirect to `factories.show` with `session()->flash('error', 'Pick a level first.')`. Otherwise `$debug = config('app.debug') || $request->boolean('debug')` — F12's touch appends `|| $factory->effectiveLevel()->isSandbox()`, the third source contracts §6 lists — and render `play` with `$factory`, `$debug`. No app layout; the page is the mount div and the Vite tag.

**B5 — Ticket** (`GameTicketController` → `IssueGameTicket`). Validate `factory_id: required|integer|exists:factories,id` (422). Load the factory; `Gate::authorize('view', $factory)` (403). Build the claims `{ userId: $user->id, factoryId: $factory->id, name: mb_substr(trim($user->name), 0, 32), exp: now()->addSeconds(60)->timestamp }`, `json_encode` with `JSON_THROW_ON_ERROR`, base64url, append `'.' . hash_hmac('sha256', $b64, $secret)`. Respond `{ ticket, ws_url: config('game.ws_url'), room: 'factory' }`. Laravel never verifies tickets; the game server does, and it rejects a `name` longer than 32 characters — hence the cap here.

**B6 — Signature middleware** (`EnsureGameServerSignature`). Read `config('game.secret')` (empty → `RuntimeException`, a 500 — misconfiguration must be loud). Compute `InternalSignature::sign($request->method(), $request->getPathInfo(), $request->getContent(), $secret)` — `getPathInfo()` is the path without the query string, which is what Node signs. Compare with `hash_equals($expected, strtolower((string) $request->header('X-Dynamite-Signature')))`. Mismatch or missing header → `401 { "error": "invalid_signature" }`. No timestamp or nonce in M1 (the seam is loopback in dev and a private VPS later; noted in Risks).

**B7 — JSON documents** (`JsonObject` cast). PHP round-trips JSON through associative arrays, which turns `{}` into `[]` — and level configs contain empty objects (`"recipes": { "keg": { …, "inputs": {} } }`) that a schema typed `object` will then reject and that Node would read as arrays. So `levels.config` and `levels.layout` are never decoded to arrays: `get()` returns `json_decode($value, false, 512, JSON_THROW_ON_ERROR)` (a `stdClass`), `set()` accepts an `object` and stores `json_encode($value, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION)`. `runs.metrics` and `run_players.stats` use the plain `array` cast because they are only ever read in Blade. Every reader of a level file (`SyncLevelsFromDisk`, the admin editor) decodes with objects too.

**B8 — Schema validation** (`LevelSchemaValidator`). Constructor reads `config('game.schema_path')`; missing file → `RuntimeException('Level schema not found at …')`. `errors(object $config)`: `$validator->validate($config, file_get_contents($path))`; when `isValid()` return `[]`; otherwise `(new ErrorFormatter())->format($result->error())` — an array keyed by JSON pointer (`/stations/0/staffing`) with one or more messages each. Called by the admin editor and by the sync.

**B9 — Sync from disk** (`SyncLevelsFromDisk`, `game:levels:sync`). Pass 1 (read and validate, no writes): list `config('game.levels_path') . '/*.json'` sorted lexically; for each file, in order — decode (objects; syntax error → `InvalidLevelFile`), require `key`, `name`, `layout` strings, require `key === stem`, run `LevelSchemaValidator::errors()` (any → `InvalidLevelFile` with the pointer list), read `layouts_path/<layout>.json` (missing, unparsable, or `key !== stem` → `InvalidLevelFile`). Pass 2 (one transaction): for each file with index `i` (1-based), `Level::updateOrCreate(['key' => $key], ['name', 'sort' => $i, 'config' => $object, 'layout' => $layoutObject])`; `is_active` is left alone on existing rows and defaults to `true` on new rows (an admin's toggle survives a re-sync; the config does not — that is the documented "reset"). Rows in the DB with no file on disk are untouched (runs reference them). An empty or missing directory is a successful sync of zero levels. The command maps `InvalidLevelFile` to `<file>: <pointer>: <message>` lines and exit 1.

**B10 — Config endpoint** (`FactoryConfigController`). Implicit binding (404 JSON `not_found` when unknown). Validate `players` (`sometimes|integer|between:1,10`). `$level = $factory->effectiveLevel()` (null → 404 `no_active_level`). Respond with `factory: { id, name, day, coin, ownerUserId: $factory->owner_id }`, `level: $level->config` (a `stdClass`, re-encoded verbatim — contracts §5 make Node responsible for validating, applying defaults and scaling, and there are no upgrades to patch until M4), `layout: $level->layout`, `members: [{ userId, name }]` ordered by name. `ownerUserId` is how the game server learns the owner; the start authority on the wire is `FactoryState.host` (F03's), not this field. `players` is validated but not branched on in M1; M2's per-breakpoint layout is its first real reader.

**B11 — Store run** (`StoreRunController` → `StoreRunRequest` → `StoreRun`; contracts §5 "Run store"). Rules per the table above. In one transaction with `Factory::lockForUpdate()`:
1. If a run with `(factory_id, seed, started_at)` exists → return it (the controller answers `200` with its id; nothing else happens). Game-server retries are therefore harmless. `started_at` is truncated to the second before it is matched or stored, because that is the precision the column holds: the key is `(factory, seed, start second)` on both sides.
2. Insert `runs`: `level_id` from `levelKey`, `day`, `seed`, `started_at`/`ended_at` parsed from ISO-8601, `status`, `grade`, `profit = pnl.profit`, `coin_earned = pnl.coin`, `metrics = the whole body`.
3. Insert `run_players` for each `players[]` entry whose `userId` matches a `users.id`. The id is read with `filter_var(..., FILTER_VALIDATE_INT)`, never cast: a `DEV_ALLOW_NO_TICKET` join's `dev-<name>`, and anything else that is not a whole number, is skipped rather than coerced (`(int) '3.9'` is `3`, a real account). A duplicate `userId` keeps the first entry. `stats` = the entry as sent.
4. If `status` is `ended` or `exploded`: `factories.day += 1`, `factories.coin += pnl.coin`. `abandoned` runs are stored but do not touch the factory.
5. If `status === 'ended'` and `rank(grade) <= rank(level.config->grading->advanceOn ?? 'C')` (A=0 … F=4): with `cap = (int) Level::active()->max('sort')`, `factories.unlocked_level = max(unlocked_level, min(level.sort + 1, cap))` when `cap > 0`, and untouched when `cap` is 0. The cap keeps the *raise* inside the shipped ladder; it is never applied to the value already stored, so deactivating levels cannot claw back a factory's progress (**contracts v2.2**, changed by this feature — the v2.1 formula `min(max(...), ...)` lowered `unlocked_level` when a level was deactivated and zeroed it when none was active). Exploded runs are always F and never unlock.
Return the `Run`. The controller responds `201 { ok: true, runId }`. A Sandbox day is never posted here (contracts §8), so it never advances `day`, `coin` or `unlocked_level`.

**B12 — Admin levels** (`can:admin` gate = `is_admin`). Index: table of key · name · sort · `flux:switch` bound to `is_active` (`toggleActive(int $id)` saves at once) · Edit link. Edit: `mount(Level $level)` puts `json_encode($level->config, JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_SLASHES)` in `$json`. `validateJson()`: decode with objects (syntax error → `addError('json', 'Not valid JSON: <message>')`); `key !== $level->key` → `addError('json', 'key cannot change; rename the file and re-sync.')`; else `$schemaErrors = LevelSchemaValidator::errors($object)` and render them as a `flux:callout` list of `pointer — message`; empty list → `flux:callout` "Valid". `save()`: runs `validateJson()` and stops on any error; otherwise sets `config = $object`, `name = $object->name`, saves, flashes "Saved". Layout is not editable here (re-sync from disk).

**B13 — Nav and dashboard.** The kit's sidebar gets a **Factories** item (`factories.index`) and, `@can('admin')`, a **Levels** item (`admin.levels.index`). `Route::redirect('/dashboard', '/factories')->name('dashboard')` replaces the kit's placeholder dashboard so the post-login landing is the factories list; the auth flow itself is untouched.

Server vs client: everything above is server-side. The only browser scripting F01 adds is the Alpine copy-to-clipboard on the join code. `main.ts` (F04) is the client of `game.ticket` and of the mount div.

## Acceptance criteria

- [x] The root `package.json` declares `"workspaces": ["shared", "game-server"]`; `npm install` at the root produces a single hoisted `@colyseus/schema` once F02/F03 land, and `composer run dev` starts `vite` and `queue:listen` without `serve`.
- [x] `php artisan migrate:fresh --seed` creates Sam (admin) and Priya with password `password` and one factory `BANG42` containing both; running it twice does not duplicate rows.
- [x] `php artisan game:levels:sync` upserts one `levels` row per file in file order with `sort` 1..n, stores `config` and `layout` as JSON objects, preserves `is_active` on re-sync, and exits 1 without writing anything when any file is invalid.
- [x] A logged-in user can create a factory and lands on its screen as owner with a 6-character join code.
- [x] A second user can join with the code typed as `bang 42` and appears in the members list; a wrong code shows "No factory has that code."; joining twice does not duplicate the membership.
- [x] A non-member requesting `/factories/{id}` or `/factories/{id}/play` gets 403.
- [x] The level select lists active levels in sort order, disables those `isUnlockedFor()` rejects, and persists a change to `factories.level_id`.
- [x] `/factories/{id}/play` renders the contracts §6 mount div with all six attributes — `data-ticket-url`, `data-factory-id`, `data-ws-url`, `data-csrf`, `data-debug`, `data-factory-url` — and the Vite tag for `resources/js/game/main.ts`; with no playable level it redirects back with "Pick a level first."
- [x] `POST /game/ticket` returns `{ ticket, ws_url, room: 'factory' }`; the ticket's base64url part decodes to `{ userId, factoryId, name, exp }` with `exp` = now + 60 s, `name` at most 32 characters, and the HMAC verifies with `GAME_SERVER_SECRET`; non-members get 403, unknown ids 422.
- [x] Every `/internal/*` request without a correct `X-Dynamite-Signature` over `METHOD + path (query excluded) + raw body` gets `401 { error: 'invalid_signature' }`, as JSON, even without an `Accept` header; a request signed over the path *with* `?players=4` is rejected.
- [x] `GET /internal/factories/{id}/config` returns exactly `{ factory: {id,name,day,coin,ownerUserId}, level, layout, members: [{userId,name}] }`, with `level.recipes.keg.inputs` still `{}`.
- [x] `POST /internal/runs` stores `runs` + `run_players`, increments `day`, adds `pnl.coin` to `coin`, raises `unlocked_level` on grade ≥ `advanceOn` without exceeding the highest active `sort` and without ever lowering it (deactivating levels, or having none active, leaves it alone), ignores the factory for `abandoned`, skips unknown player ids, accepts the string `factoryId` the server sends, and answers the same `runId` (with `200`) when the same run is posted twice.
- [x] The run appears in the factory's run history with day, level, grade, status, profit, coin.
- [x] A non-admin gets 403 on `/admin/levels`; an admin can toggle `is_active`, and the editor rejects invalid JSON, a changed `key`, and schema violations (listing JSON pointers) while saving valid JSON.
- [x] `vendor/bin/pint --test` and `php artisan test` pass.

## Test plan

Unit (`tests/Unit`):
- `JsonObjectTest`: it decodes jsonb to an object · it preserves empty objects through a save and reload · it preserves `6.0` as a float.
- `LevelSchemaValidatorTest` (fixture schema): it returns no errors for the F02 level fixture · it keys errors by JSON pointer · it treats an empty object as an object, not an array · it throws when the schema file is missing · it validates a level against the schema `config/game.php` ships (the only test that runs the real draft-07 document, so a renamed path or a broken `$ref` cannot ship green).
- `InternalSignatureTest`: it signs uppercase method + path + body with no separators · it excludes the query string from the canonical string · it produces lowercase hex · it changes when the body changes.

Feature (`tests/Feature`, `RefreshDatabase`, `config(['game.secret' => 'test-secret', 'game.schema_path' => fixture, 'game.levels_path' => fixture dir, 'game.layouts_path' => fixture dir])` in `Pest.php`'s `beforeEach`):
- `SeederTest`: it seeds two users and a shared factory · it is idempotent.
- `Factories/CreateFactoryTest`: it creates a factory with the creator as owner · it generates a six character join code from the safe alphabet · it rejects a name shorter than two characters.
- `Factories/JoinByCodeTest`: it joins a factory by code · it normalises case, spaces and hyphens · it shows an error for an unknown code · it does not duplicate an existing membership.
- `Factories/IndexTest`: it lists only the user's factories.
- `Factories/ShowTest`: it forbids non-members · it forbids a non-member from mounting the component · it forbids a former member from setting the level (Livewire updates never re-run the route middleware) · it lists members with roles · it lists active levels and disables locked ones · it persists a level selection · it rejects selecting a locked level · it shows the latest twenty runs newest first · it disables Enter factory when no level is playable.
- `PlayPageTest` (`$this->withoutVite()`): it renders the mount div with all six data attributes · it points data-factory-url at the factory screen · it sets data-debug from app.debug or ?debug=1 · it forbids non-members · it redirects to the factory when no level is playable.
- `Game/TicketTest` (`$this->freezeTime()`): it issues a signed ticket to a member · it encodes userId, factoryId, name and a sixty second expiry · it truncates a name longer than thirty-two characters · it forbids non-members · it rejects an unknown factory id · it requires authentication · it fails loudly when the secret is empty.
- `Internal/SignatureTest` (the header/body/case matrix, on closure routes): it rejects a request without a signature · it rejects a wrong signature · it rejects a signature over a different body · it rejects a signature that included the query string · it accepts a valid signature · it renders the rejection as JSON without an Accept header. The two real routes carry their own unsigned-request tests, below, so the middleware cannot be dropped from the group without a failure.
- `Internal/FactoryConfigTest`: it returns the contract shape · it includes the owner user id as an integer · it uses the selected level · it falls back to the lowest sort active level · it ignores an inactive selected level · it returns no_active_level when none is playable · it preserves empty objects in the level config · it rejects an invalid players value · it accepts players between one and ten · it returns 404 for an unknown factory · it rejects an unsigned request · it rejects a signature that covers the path with its query string.
- `Internal/StoreRunTest` (fixture `run.json`): it stores the run and its players · it stores the whole payload as metrics · it accepts a string factoryId · it credits coin and advances the day for an ended run · it advances the day but credits zero for an exploded run · it leaves the factory untouched for an abandoned run · it unlocks the next level on grade C · it does not unlock on grade D · it never lowers unlocked_level · it caps unlocked_level at the highest active level · it skips players who are not users · it keeps the first of duplicate player ids · it returns 200 and the existing run when posted twice · it rejects an unknown levelKey · it rejects a non-integer coin · it rejects an unsigned request · it rejects a wrongly signed request · it does not lower unlocked_level when the top levels are deactivated · it leaves unlocked_level alone when no level is active · it rejects a player whose userId is not a scalar · it never coerces a userId that is not a whole number onto an account · it stores a run from a dev join and skips its pseudo player id · it keys a run on the second.
- `Console/SyncLevelsTest`: it creates levels from disk in file order · it updates config and name on re-sync · it preserves is_active on re-sync · it aborts without writing when one file fails the schema · it aborts when a file's key differs from its stem · it aborts when the layout file is missing · it succeeds with an empty directory.
- `Admin/LevelEditorTest`: it forbids non-admins · it forbids a user who has lost admin from toggling or saving a level · it toggles is_active · it shows the config pretty printed · it rejects invalid JSON · it lists schema errors by pointer · it refuses a changed key · it saves a valid config and updates the name.

In-app verification (Herd, `https://dynamite.test`, `composer run dev`, `GAME_SERVER_SECRET=devsecret`):
1. `php artisan migrate:fresh --seed && php artisan game:levels:sync`. If F12's files are not in yet, copy `shared/tests/fixtures/level-m1.json` → `config/game/levels/level-01-basic-flow.json` (rename its `key` to the stem) and `shared/tests/fixtures/layout-one-line.json` → `config/game/layouts/one-line.json`, uncommitted — F02's fixtures are the ones that pass the real schema. Screenshot the sync output.
2. Log in as `sam@example.com` → redirected to `/factories` → open **Kaboom & Sons**: members Sam (owner) and Priya, code `BANG42`, level select with the synced levels enabled. Pick level 2; reload; it is still level 2. Screenshot.
3. Click **Enter factory**; view source of `/factories/1/play` and confirm all six mount attributes (the console error for a missing `main.ts` is expected until F04 lands). Screenshot the source.
4. In a private window log in as `priya@example.com`, go to **Join**, type `bang 42` → lands on the same factory. Try `ZZZZZZ` → "No factory has that code.".
5. As Sam open `/admin/levels`, toggle the last level off, reload the factory page → it is gone from the select. Edit level 1: change `"clipboardSeconds": 3` to `"three"`, Validate → a pointer error `/clipboardSeconds`; revert, Save → "Saved". As Priya, `/admin/levels` → 403. Screenshots.
6. From a shell: `SIG=$(printf 'GET/internal/factories/1/config' | openssl dgst -sha256 -hmac devsecret | awk '{print $NF}'); curl -s -H "X-Dynamite-Signature: $SIG" "https://dynamite.test/internal/factories/1/config?players=4" | jq .` — shape matches (including `ownerUserId`) even though the signature omits the query; `curl -s https://dynamite.test/internal/factories/1/config` → `{"error":"invalid_signature"}`. Paste both outputs.
7. `BODY=$(cat tests/Fixtures/game/run.json); SIG=$(printf 'POST/internal/runs%s' "$BODY" | openssl dgst -sha256 -hmac devsecret | awk '{print $NF}'); curl -s -X POST -H "Content-Type: application/json" -H "X-Dynamite-Signature: $SIG" --data-binary "$BODY" https://dynamite.test/internal/runs` → `{"ok":true,"runId":1}`; run it again → same `runId` with `200`. Reload the factory page: day 2, coin credited, one run in history. Screenshot.

## Tasks

- [x] 1. Confirm the starter kit is in place (Laravel installer, Livewire kit with class components, Pest, Postgres; flags to be checked in `laravel new --help`). `composer require opis/json-schema` (confirm the current 2.x on Packagist) and set the `dev` script to `vite` + `queue:listen`. Write the root `package.json` (`"workspaces": ["shared", "game-server"]`), `config/game.php` and the `.env.example` keys. Verify with `php artisan config:show game` and `npm pkg get workspaces`.
- [x] 2. Migrations (`users.is_admin`, `levels`, `factories`, `factory_members`, `factory_upgrades`, `runs`, `run_players`), enums, models with relationships, model factories, `DatabaseSeeder`. Test: `tests/Feature/SeederTest.php`.
- [x] 3. `app/Casts/JsonObject.php` on `Level::config`/`layout`. Test: `tests/Unit/Casts/JsonObjectTest.php`.
- [x] 4. `app/Game/InternalSignature.php`, `app/Http/Middleware/EnsureGameServerSignature.php`, `routes/internal.php`, `bootstrap/app.php` wiring and JSON exception rendering. Tests: `tests/Unit/Game/InternalSignatureTest.php`, `tests/Feature/Internal/SignatureTest.php` (against a throwaway closure route inside the test).
- [x] 5. `app/Policies/FactoryPolicy.php`, `Gate::define('admin')` in `AppServiceProvider`, `routes/web.php` skeleton with the `dashboard` redirect. Test: 403 cases in `tests/Feature/Factories/ShowTest.php` (component stub returns "ok" for now).
- [x] 6. `CreateFactory` + `Livewire\Factories\Index` and `Create` + views. Tests: `tests/Feature/Factories/CreateFactoryTest.php`, `IndexTest.php`.
- [x] 7. `JoinFactoryByCode` + `UnknownJoinCode` + `Livewire\Factories\Join` + view. Test: `tests/Feature/Factories/JoinByCodeTest.php`.
- [x] 8. `IssueGameTicket` (claims per contracts §5, `name` capped at 32) + `GameTicketController` + route `game.ticket`. Test: `tests/Feature/Game/TicketTest.php`.
- [x] 9. `tests/Fixtures/game/*`: copy F02's `level-m1.json` and `layout-one-line.json` into the fixture level/layout dirs (renaming the level `key`s), write the permissive fixture schema and the `RunPayload` fixture, then `app/Game/LevelSchemaValidator.php`. Test: `tests/Unit/Game/LevelSchemaValidatorTest.php`.
- [x] 10. `SyncLevelsFromDisk` + `InvalidLevelFile` + `app/Console/Commands/SyncLevels.php`. Test: `tests/Feature/Console/SyncLevelsTest.php`.
- [x] 11. `Livewire\Factories\Show` + view (members, code, level select via `isUnlockedFor`, Enter link, run history). Test: complete `tests/Feature/Factories/ShowTest.php`.
- [x] 12. `PlayController` + `resources/views/play.blade.php` with the six contracts §6 attributes + route `factories.play`. Test: `tests/Feature/PlayPageTest.php`.
- [x] 13. `Internal\FactoryConfigController` (response includes `factory.ownerUserId`). Test: `tests/Feature/Internal/FactoryConfigTest.php`.
- [x] 14. `StoreRunRequest` + `StoreRun` (idempotency key, day/coin, capped unlock) + `Internal\StoreRunController`. Test: `tests/Feature/Internal/StoreRunTest.php`.
- [x] 15. `Livewire\Admin\Levels\Index` and `Edit` + views + admin routes. Test: `tests/Feature/Admin/LevelEditorTest.php`.
- [x] 16. Sidebar nav items; `vendor/bin/pint`; `php artisan test`; run the in-app verification steps and attach the screenshots and curl output; tick the status boxes.

## Risks & open questions

- **`unlocked_level` advancement is pulled forward from M4.** Doc 18 files "advance on C" under M4. Without it the gate on the level select makes every fresh factory a level-1-only factory in M1 and `unlocked_level` is dead. It is one comparison against the level's `grading.advanceOn` (default `'C'`, contracts §13), capped at `Level::active()->max('sort')`. Because Sandbox is the last file lexically it holds the highest `sort`, so the cap can let `unlocked_level` reach Sandbox's number — harmless, since `isUnlockedFor()` short-circuits on `isSandbox()` and nothing else reads the value. The D/F "repeat the day" banner stays M4.
- **`config('game.server_url')` has no M1 reader.** It is declared because contracts §2 declares `GAME_SERVER_URL`; if M4's force-end does not use it, delete it.
- **One layout per level breaks at M2.** Contracts §8 pins M1 to one layout per level and puts `scaleLevel()` (including `breakpoint.layout`) in Node. `docs/19` gives each scaling breakpoint its own layout; `levels.layout jsonb` holds one. M2 will either turn `levels.layout` into a map keyed by layout key or add a `layouts` table, and `?players=N` (validated but unused now) becomes the selector.
- **Test fixtures are copies of F02's.** `tests/Fixtures/game/levels/*` and `layouts/one-line.json` are byte copies of `shared/tests/fixtures/level-m1.json` / `layout-one-line.json` with the `key`s renamed, because those are the only level files that pass the real schema (contracts §8). If F01 is built before F02, task 9 copies whatever F02 has at that point and re-copies at F02's merge; nothing in F01 reads their contents beyond `key`, `name`, `layout` and `recipes.keg.inputs`.
- **No replay protection on the internal seam.** The signature has no timestamp or nonce; a captured `POST /internal/runs` could be replayed, but the `(factory_id, seed, started_at)` uniqueness makes a replay a no-op. Acceptable for a loopback/private-VPS seam; revisit if the game server ever leaves the host.
- **Starter-kit file names.** The sidebar partial path and the `dashboard` route definition are as the kit ships today; confirm both when scaffolding and adjust the two one-line edits if the kit renamed them.
- **`opis/json-schema` version.** Packagist was unreachable while this doc was written; `^2.4` is the current 2.x line as of the author's knowledge — confirm at `composer require`, and confirm draft-07 support (contracts §8 pins the schema to draft-07). The API used (`Validator::validate`, `ErrorFormatter::format`) is stable across 2.x.
- **Seeder does not sync levels.** `db:seed` must work before F02's schema and F12's files exist, so levels are a separate `game:levels:sync` step; until those land, in-app verification uses F02's fixtures copied locally.

**Contract change requested** (additions to `00-contracts.md`):
1. §5 ticket: contracts pin Node's `verifyTicket` to a `name` of 1–32 characters after trim but do not say who enforces the length. F01 truncates with `mb_substr(trim($user->name), 0, 32)` when it signs the ticket (`users.name` allows 255), so a long display name cannot produce an unjoinable ticket. Contracts should record that the issuer truncates, or drop Node's upper bound.
