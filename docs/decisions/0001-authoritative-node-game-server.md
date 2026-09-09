# ADR 0001 — The simulation runs in a Node game server, not in Laravel

**Status:** accepted · 2026-09-04 · **confirmed by Sam** via plan review, same day

## Decision
The authoritative 20 Hz factory simulation runs in a separate Node 22 / TypeScript process.
Laravel never simulates; it issues join tickets, serves config, and stores results.

## Why
A game tick loop needs a long-lived process, ordered low-latency input, and delta state
sync. PHP-FPM has none of these; a long-running Artisan command with an async event loop can
be made to, but every piece (rooms, reconnection, patching) is hand-built. The seam between
"company" (accounts, saves, admin — CRUD, Laravel's home turf) and "floor" (the tick) is
natural and keeps each side small.

## Rejected
- **Laravel + Reverb as the game server.** Reverb is a Pusher-protocol broadcaster; client
  events are fire-and-forget pub/sub and input would go through HTTP. Workable for a
  turn-based game, wrong for this one. Reverb is kept for lobby presence.
- **All-Node (no Laravel).** Loses the auth/admin/Eloquent ergonomics Sam wants and would
  reinvent them in Express.

## Consequences
Two processes to run locally and deploy. One shared secret. `shared/` TS is the contract.
