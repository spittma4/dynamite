# Project rules index

Rules are grouped by the paths they govern. Read every file whose glob covers the path
you are about to touch. `dynamite.md` applies everywhere.

| Glob | Rule file |
|------|-----------|
| `**` | `dynamite.md` — how this project is built: TDD, contracts, ownership, verification, no commits by agents |
| `shared/**` | `shared.md` — the shared TypeScript package (schema, messages, config, pure sim) |
| `game-server/**` | `game-server.md` — the Node/Colyseus authoritative server |
| `resources/js/game/**` | `client.md` — the Phaser client, and where a quoted sign comes from |
| `app/**`, `routes/**`, `database/**`, `resources/views/**`, `tests/**` | `laravel.md` — the Laravel shell |
| `config/game/**` | `config.md` — level, layout and copy JSON |
| `config/game/layouts/**` | `layouts.md` — invariants a layout must satisfy that the drawing depends on |
| `config/game/levels/**` | `levels.md` — invariants a station block must satisfy that the drawing depends on |
| `shared/src/sim/stations.ts` | `sim.md` — what the floor ring is for, and what it is not |
| `resources/js/game/minigames/**` | `minigames.md` — where a panel's item colours come from |
| `resources/js/game/render/**` | `render.md` — what a mark on the floor is allowed to promise |
