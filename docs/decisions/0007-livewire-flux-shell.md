# ADR 0007 — Livewire + Flux for the shell; Phaser as an island

**Status:** accepted · 2026-09-04 · **confirmed by Sam** via plan review, same day · Livewire 4.4, Flux 2.18 (free tier is enough)

## Decision
Login, lobby, factory screen, upgrades, report history, and admin are Livewire components
styled with Flux. The game route renders one `wire:ignore` div that the Phaser client mounts
into.

## Why
The shell is small CRUD with a couple of live lists (Reverb presence). That is Livewire's
sweet spot and matches Sam's Laravel defaults. The heavy TypeScript lives in the game client
and the game server regardless of what the shell is.

## Rejected
- **Inertia + Vue.** Fine, and the natural pick if the lobby grows into an app of its own.
  It would share `shared/` types with the game client, which is a real but small benefit
  today. Switch if the shell ever needs more than forms and lists.
