# Running DYNAMITE locally

Two processes: Laravel (served by Herd) and the Node game server. Postgres is Herd's.

`docs/PLAYTEST.md` (F12, wave 5) will cover *what to watch for* in a playtest — this file is
just how to get it on screen.

## One-time

Already done on this machine, listed so a fresh clone knows:

```bash
composer install && npm install                 # npm workspaces cover shared/ and game-server/
cp .env.example .env && php artisan key:generate
# .env: DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_DATABASE=dynamite DB_USERNAME=postgres DB_PASSWORD=
# and GAME_SERVER_URL / GAME_SERVER_WS_URL / GAME_SERVER_SECRET
psql -h 127.0.0.1 -U postgres -d postgres -c 'create database dynamite'
php artisan migrate --seed
herd link dynamite && herd secure dynamite      # → https://dynamite.test
npm run build
```

`game-server/.env` needs the **same** `GAME_SERVER_SECRET` as the Laravel `.env`, plus
`DEV_ALLOW_NO_TICKET=1` for local joins and `NODE_TLS_REJECT_UNAUTHORIZED=0` so Node accepts
Herd's local certificate.

## Every time

```bash
cd game-server && npm run dev        # Colyseus on :2567 — leave it running
```

Herd already serves `https://dynamite.test`. Run `npm run build` (or `npm run dev` in another
terminal) after touching client code.

Then: **https://dynamite.test/login** → Factories → *Kaboom & Sons* → **Enter factory**.

Seeded accounts, password `password` for both:

| Email | Role |
|---|---|
| `sam@example.com` | owner of factory 1, admin (can edit levels) |
| `priya@example.com` | member |

For two players, use a second browser or a private window — the same browser shares one
session cookie.

## Controls

| Key | Does |
|---|---|
| `WASD` / arrows | Walk |
| `E` | Pick up · put down · join a work tile · catch · lever |
| `Space` | The beat: charge/release, stamp, tap, drop, shove — or **throw** what you carry |
| `Q` / `E` | Sticky selectors (colour, crate size) inside a mini-game |
| `Esc` | Leave the station (forfeits the cycle, resets the combo) |
| `Tab` | Order board |
| `Shift` + arrows | Emotes — ↑ HELP · ↓ STOP · ← GO BACK · → ? |
| `~` | Debug overlay (per-station workers, efficiency, cycle, shelves, RTT) |

## Known limits while the MVP is being built

- **Solo works** (ADR 0013): the dev level and Level 1 accept a single player, with a shorter
  book (4 orders) and slower trucks so one person can finish a day. Levels 2–4 need 3 players
  — they are about coordination and crowding. The best experience is 3+.
- Waves 4–5 are in flight: mini-games, hazards, the day loop and the report card. Check
  `docs/features/README.md` for what is green right now.

## Tests

```bash
php artisan test --compact          # Laravel
cd shared && npx vitest run         # shared sim
cd game-server && npx vitest run    # game server
npm run test:client                 # Phaser client
npm run build                       # must include resources/js/game/main.ts
```

Never run a bare `vitest` (it watches forever) and never boot the game server from an
automated agent — see `.ai/rules/dynamite.md`.

## When the game rejects a level that looks fine on disk

`php artisan game:levels:sync --check`

The `levels` table holds seeded copies of the files in `config/game/levels/`, and admin edits go
to the table, so the two are allowed to differ and syncing is deliberate. That means a re-laid
floor can ship on disk while the running game keeps building rooms from the old geometry — with
every test green, because every suite reads the files and none reads the database.

The check writes nothing and names each stale level. `php artisan game:levels:sync` takes the
files; keep the table instead if the difference is an admin edit you meant.
