# ADR 0003 — Phaser 4 over PixiJS

**Status:** accepted · 2026-09-04 · Phaser 4.2.1, Pixi 8.20

## Decision
Render the factory with Phaser 4.

## Why
Phaser ships scenes, tilemaps, input, tweens, particles, camera, audio, and arcade physics.
Pixi is a renderer; every one of those is a library or a hand-roll on top. For a top-down
tile game with placeholder art, Phaser's batteries are the batteries we need. Physics is
used only for local prediction/feel — the server is authoritative.

## Rejected
- **PixiJS.** Better if we wanted a custom engine. We don't.
- **DOM/CSS.** Eight moving avatars, particles, and screen shake in the DOM is pain.

## Consequences
Phaser 4 is the current major; verify tilemap and container APIs against the 4.x docs during
M0 rather than assuming 3.x behaviour.
