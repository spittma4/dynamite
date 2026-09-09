# shared/ — the package both sides import

- Pure TypeScript, ESM, strict. No runtime dependencies beyond `@colyseus/schema` and `ajv`.
- `src/schema/` holds the `@colyseus/schema` classes exactly as named in the contracts §3.
  Decorators need `experimentalDecorators` + `useDefineForClassFields: false` (already in
  `tsconfig.json`); keep field initialisers on the class (`@type('number') groove = 50`).
- `src/sim/*.ts` are pure functions over plain data: no I/O, no Colyseus imports, no `Date`.
  Time comes in as a parameter. RNG comes in as a function `() => number`.
- Every pure function has a vitest test in `tests/` whose names read like requirements
  (`it('holds the last curve value above the max key')`) and use the numbers from the
  design docs.
- `src/config/schema.json` is the JSON Schema Laravel also reads; `validate.ts` wraps ajv.
- Exported through `src/index.ts` only. The client imports via the Vite alias `@shared`,
  the server via the relative path `../shared/src` (see its tsconfig `paths`).
