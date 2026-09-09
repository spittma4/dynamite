# ADR 0002 — Colyseus for the game server

**Status:** accepted · 2026-09-04 · **confirmed by Sam** via plan review, same day · Colyseus 0.18.5, `@colyseus/schema` 5.0, `@colyseus/sdk` 0.18 client

## Decision
Use Colyseus rooms with `@colyseus/schema` state.

## Why
It is a room-based authoritative state server with binary delta sync, simulation interval,
join/leave/reconnect lifecycle, and a browser SDK. That is exactly the shape of "8 people
share one factory". Writing it on bare `ws` is a week of netcode before any gameplay.

## Rejected
- **Bare `ws` + hand-rolled state.** More control, more code, no gameplay for a week.
- **Socket.IO.** Transport only; still need rooms/state/patching.
- **Nakama / PlayFab-style hosted.** Overkill for a private, single-VPS game.

## Consequences
State must be expressed as schema classes (see 12 — data model). Complex per-item attributes
go in a JSON string field rather than a dozen typed fields; rarely-changing data is cheap
that way.
