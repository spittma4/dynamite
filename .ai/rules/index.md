# Project rules index

Rules are grouped by the paths they govern. Read every file whose glob covers the path
you are about to touch. `dynamite.md` applies everywhere.

| Glob | Rule file |
|------|-----------|
| `**` | `dynamite.md` — how this project is built: TDD, contracts, ownership, verification, no commits by agents |
| `shared/**` | `shared.md` — the shared TypeScript package (schema, messages, config, pure sim) |
| `game-server/**` | `game-server.md` — the Node/Colyseus authoritative server |
| `resources/js/game/**` | `client.md` — the Phaser client |
| `app/**`, `routes/**`, `database/**`, `resources/views/**`, `tests/**` | `laravel.md` — the Laravel shell |
| `config/game/**` | `config.md` — level, layout and copy JSON |
| `config/game/layouts/**` | `layouts.md` — invariants a layout must satisfy that the drawing depends on |
| `config/game/levels/**` | `levels.md` — invariants a station block must satisfy that the drawing depends on |
