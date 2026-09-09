# Laravel — the shell around the game

- Follow the Boost guidelines in `CLAUDE.md` (`make:` commands, Pest via
  `php artisan make:test --pest`, Pint before finishing, feature tests over unit tests).
- `declare(strict_types=1)`; explicit parameter and return types; early returns.
- Business logic in `app/Actions/*` (single-purpose invokable classes). Controllers and
  Livewire components stay thin. Models hold relationships, casts, scopes.
- Livewire 4 **class components** with Flux (free tier) views; keep server state small
  (ids, not serialised arrays). Check the starter kit's existing components and layouts
  before adding a new pattern.
- Internal endpoints (`/internal/*`) are protected by the HMAC middleware defined in F01;
  `POST /game/ticket` is session-authenticated. Never expose `GAME_SERVER_SECRET`.
- Level JSON is validated on save against `shared/src/config/schema.json`.
- Postgres (Herd): `jsonb` columns for `levels.config`, `levels.layout`, `runs.metrics`,
  `run_players.stats`. No extensions.
- Factories with explicit states in tests; never manual model creation.
