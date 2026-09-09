# DYNAMITE — how this project is built

Design: `docs/00`–`19`, `docs/decisions/`. Implementation: `docs/features/00-contracts.md`
(binding) and one doc per feature `docs/features/F01`–`F12`. Plan and waves:
`docs/superpowers/plans/2026-09-04-mvp.md`. Tracker: `docs/features/README.md`.

- **Test-driven, always.** Write the failing test first (vitest for `shared/` and
  `game-server/`, Pest for Laravel), run it to see it fail, write the smallest
  implementation that makes it pass, refactor with the tests green. Never weaken, skip, or
  delete a test to make it pass; if a test is wrong, say so and fix the test on its own.
- **Contracts are binding.** Names, signatures, message names, schema fields, config keys
  and file paths come from `docs/features/00-contracts.md` and the feature doc. A change to
  a contract is made in `00-contracts.md` first and called out.
- **Ownership.** Edit only the paths your feature owns (listed in its doc) plus your own
  `shared/src/sim/<module>.ts` and test. Do not reformat or "tidy" files you don't own.
- **Consequences are player-caused, never random.** No random fumbles, no random loss.
  Every spark has a cause; the explosion is preceded by the pile, the beacon, and a fuse.
- **Config over code.** Any number a designer might tune lives in the level JSON
  (`config/game/levels/*.json`), read through the shared config types. Joke lines live in
  `config/game/copy.json`, never inline.
- **Timing in milliseconds.** Windows come from config; the server judges every input
  against its own clock; no OK threshold under ±100 ms, no Perfect under ±45 ms.
- **Tick the boxes.** Update the feature doc's `Status` header and acceptance criteria as
  you finish, and the row in `docs/features/README.md`. In-app boxes only after a browser
  showed the behaviour.
- **No commits by agents.** Leave the working tree for the repo owner to commit.
- **Verify library APIs, don't remember them.** Colyseus 0.18, `@colyseus/schema` 5,
  `@colyseus/sdk` 0.18, Phaser 4.2 and Laravel 13 / Livewire 4 / Flux 2: look up the current
  docs (Context7 or Boost `search-docs`) before using an API you have not seen in this repo.
