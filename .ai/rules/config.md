# config/game/ — levels, layouts, copy

- `levels/*.json` follow `shared/src/config/types.ts` and validate against
  `shared/src/config/schema.json` (a vitest test in `shared/` checks every file).
- Numbers come from the design docs (`docs/03`, `04`, `05`, `13`, `16`, `17`, `18`, `19`);
  when you change one, say why in the level file's `notes` field, not in code.
- `layouts/*.json` are tilemaps in tile units; the MVP layout is `mvp-small` (28 × 18) as
  drawn in `docs/02` and the published plan.
- `copy.json` holds every joke line (clipboard, bubbles, banners, chore labels). Code
  references keys; it never contains the strings.
- Seeded into the `levels` table by `php artisan game:levels:sync`; admin edits the DB copy.
