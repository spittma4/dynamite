# 12 — Data model

## Postgres (Laravel migrations)

```sql
users            id · name · email · password · is_admin bool default false · timestamps
factories        id · owner_id → users · name · coin int default 0 · day int default 1
                 · unlocked_level int default 1 · timestamps
factory_members  factory_id → factories · user_id → users · role enum('owner','member')
                 · pk (factory_id, user_id)
factory_upgrades factory_id → factories · upgrade_key text · purchased_at · day int
                 · pk (factory_id, upgrade_key)
levels           id · key text unique · name · sort int · config jsonb · is_active bool
runs             id · factory_id → factories · level_id → levels · day int · seed bigint
                 · started_at · ended_at nullable · status enum('running','ended','abandoned')
                 · grade char(1) nullable · profit int nullable · coin_earned int nullable
                 · metrics jsonb nullable
run_players      run_id → runs · user_id → users · stats jsonb · pk (run_id, user_id)
```

- **Upgrade catalogue is code/config**, not a table — it changes with balance, not with
  users. `factory_upgrades` just records ownership.
- `levels.config` is the seeded JSON from `config/game/levels/*.json`. Admin edits the DB
  row; a `game:levels:sync` command re-seeds from disk when you want to reset.
- `runs.metrics` is exactly the report blob Node posts. No normalisation until a query needs
  it.
- **Saving a factory** = the row already exists. Coin, day, upgrades, and unlocked level are
  the save. Payday votes are transient Reverb presence state; only the purchase is stored. Rounds are not resumable mid-way (deliberately — "abandoned" is a status, not a bug).

## Admin (simple rule)

`is_admin` gate. Admins can: edit level configs (a JSON editor with schema validation and a
"validate" button), view all factories and runs, force-end a stuck run, and toggle
`is_active` on levels. That's it. No roles table until a second role exists.

## Authoritative game state (Colyseus schema, `shared/schema.ts`)

```ts
class FactoryState extends Schema {
  @type('number') clock = 0;            // seconds since round start
  @type('number') roundLength = 600;
  @type('number') groove = 50;
  @type('number') score = 0;
  @type('string') phase: 'lobby'|'running'|'ended' = 'lobby';
  @type({ map: PlayerState })  players = new MapSchema<PlayerState>();
  @type({ map: StationState }) stations = new MapSchema<StationState>();
  @type({ map: ItemState })    items = new MapSchema<ItemState>();
  @type({ map: OrderState })   orders = new MapSchema<OrderState>();
  @type([ EventState ])        activeEvents = new ArraySchema<EventState>();
  @type([ 'number' ])          spillTiles = new ArraySchema<number>();   // packed x*W+y
}

class PlayerState extends Schema {
  @type('string') userId; @type('string') name; @type('number') colour;
  @type('number') x; @type('number') y; @type('number') facing;
  @type('string') line = 'a';            // lobby-lock assignment; a hat, never a lock
  @type('string') stationId = '';        // '' = on the floor
  @type('string') workTile = '';         // which tile of the station, '' = aisle
  @type('string') carrying = '';         // item id
  @type('number') clipboardUntil = 0;    // context-switch lockout
  @type('string') chore = '';            // 'sweep'|'unjam'|'' 
}

class StationState extends Schema {
  @type('string') id; @type('string') type;
  @type('string') line = '';             // 'a'|'b' for line stations, '' for shared
  @type('string') state: 'idle'|'starved'|'working'|'jammed';
  @type('number') progress = 0;
  @type('number') workers = 0;           // derived, but synced for the HUD
  @type('number') efficiency = 0;
  @type([ 'string' ]) inputShelf = new ArraySchema<string>();
  @type([ 'string' ]) outputShelf = new ArraySchema<string>();
  @type('number') floorCount = 0;
  @type('number') utilization = 0;       // rolling 30 s
}

class ItemState extends Schema {
  @type('string') id; @type('string') type;   // 'keg'|'casing'|'stick'|'crate'
  @type('string') orderId = '';
  @type('number') x; @type('number') y;       // tile; -1 when on a shelf or carried
  @type('string') holder = '';                // station id, player id, or ''
  @type('string') attrs = '';                 // JSON — small, rarely changes, cheaper than 12 fields
}

class OrderState extends Schema {
  @type('string') id; @type('string') linesJson; @type('string') priority;
  @type('number') dueAt; @type('string') status; @type('boolean') ambiguous = false;
}
```

Server-only (not synced): the RNG seed, per-tick accumulators, metrics samplers, event
cooldowns, the config blob.
