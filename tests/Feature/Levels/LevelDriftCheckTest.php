<?php

declare(strict_types=1);

use App\Actions\SyncLevelsFromDisk;
use App\Models\Level;

// The drift this exists to catch is drift in the levels we actually ship, so
// this file points at the real files rather than the two-level fixture set the
// rest of the suite syncs.
beforeEach(function (): void {
    config([
        'game.levels_path' => base_path('config/game/levels'),
        'game.layouts_path' => base_path('config/game/layouts'),
        'game.schema_path' => base_path('shared/src/config/schema.json'),
    ]);
});

// The levels table holds seeded copies of the level files, and admin edits go to
// the DB copy — so the two are allowed to differ and syncing is deliberate, not
// automatic. That is exactly why nothing noticed when a re-laid floor shipped on
// disk and the running game kept building rooms from yesterday's geometry: every
// suite reads the files, and only the database can answer whether the game the
// developer is about to play matches the repo.
it('reports no drift right after a sync', function () {
    app(SyncLevelsFromDisk::class)->handle();

    $this->artisan('game:levels:sync --check')
        ->expectsOutputToContain('in step with the files')
        ->assertExitCode(0);
});

it('names the stale level and fails when the stored config is behind the file', function () {
    app(SyncLevelsFromDisk::class)->handle();

    $level = Level::where('key', 'level-01-basic-flow')->firstOrFail();
    $config = $level->config;
    $config->stations[1]->outputShelf->tile = [13, 10];
    $level->update(['config' => $config]);

    $this->artisan('game:levels:sync --check')
        ->expectsOutputToContain('level-01-basic-flow')
        ->assertExitCode(1);
});

// Postgres stores config as jsonb and reorders object keys, so the stored copy is
// never byte-identical to the file. A string comparison passed every test and then
// reported all five levels stale against a freshly synced database.
it('does not call a level stale for the key order the database gave it back', function () {
    app(SyncLevelsFromDisk::class)->handle();

    $level = Level::where('key', 'level-01-basic-flow')->firstOrFail();
    $reordered = json_decode((string) json_encode(array_reverse((array) $level->config, true)));
    $level->update(['config' => $reordered]);

    expect(app(SyncLevelsFromDisk::class)->drift())->not->toContain('level-01-basic-flow');
});

it('names a level that is on disk and missing from the table', function () {
    app(SyncLevelsFromDisk::class)->handle();
    Level::where('key', 'sandbox')->delete();

    $this->artisan('game:levels:sync --check')
        ->expectsOutputToContain('sandbox')
        ->assertExitCode(1);
});

it('writes nothing when checking', function () {
    app(SyncLevelsFromDisk::class)->handle();

    $level = Level::where('key', 'level-01-basic-flow')->firstOrFail();
    $level->update(['name' => 'Edited In The Admin']);

    $this->artisan('game:levels:sync --check')->assertExitCode(1);

    expect(Level::where('key', 'level-01-basic-flow')->firstOrFail()->name)
        ->toBe('Edited In The Admin');
});
