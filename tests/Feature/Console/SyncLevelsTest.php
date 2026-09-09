<?php

declare(strict_types=1);

use App\Models\Level;
use Illuminate\Support\Facades\File;

/**
 * Point the sync at a private copy of the fixtures so a test can corrupt one.
 */
function scratchLevels(): string
{
    $root = base_path('storage/framework/testing/dynamite-levels/'.uniqid());

    File::ensureDirectoryExists($root.'/levels');
    File::ensureDirectoryExists($root.'/layouts');
    File::copyDirectory(base_path('tests/Fixtures/game/levels'), $root.'/levels');
    File::copyDirectory(base_path('tests/Fixtures/game/layouts'), $root.'/layouts');

    config(['game.levels_path' => $root.'/levels', 'game.layouts_path' => $root.'/layouts']);

    return $root;
}

afterEach(function (): void {
    File::deleteDirectory(base_path('storage/framework/testing/dynamite-levels'));
});

it('creates one level per file in file order', function () {
    $this->artisan('game:levels:sync')
        ->expectsOutputToContain('created level-01-basic-flow')
        ->expectsOutputToContain('created level-02-too-much-powder')
        ->assertExitCode(0);

    $levels = Level::orderBy('sort')->get();

    expect($levels->pluck('key')->all())->toBe(['level-01-basic-flow', 'level-02-too-much-powder'])
        ->and($levels->pluck('sort')->all())->toBe([1, 2])
        ->and($levels->first()->name)->toBe('Basic Flow')
        ->and($levels->first()->is_active)->toBeTrue()
        ->and($levels->first()->config->key)->toBe('level-01-basic-flow')
        ->and($levels->first()->layout->key)->toBe('one-line')
        ->and($levels->first()->config->recipes->keg->inputs)->toBeInstanceOf(stdClass::class);
});

it('updates the name and config of a level that already exists', function () {
    $level = Level::factory()->create(['key' => 'level-01-basic-flow', 'name' => 'Stale name', 'sort' => 9]);

    $this->artisan('game:levels:sync')
        ->expectsOutputToContain('updated level-01-basic-flow')
        ->assertExitCode(0);

    expect($level->fresh())
        ->name->toBe('Basic Flow')
        ->sort->toBe(1);
});

it('leaves is_active alone on a re-sync', function () {
    Level::factory()->inactive()->create(['key' => 'level-01-basic-flow', 'sort' => 1]);

    $this->artisan('game:levels:sync')->assertExitCode(0);

    expect(Level::where('key', 'level-01-basic-flow')->sole()->is_active)->toBeFalse();
});

it('leaves a level with no file on disk alone', function () {
    $retired = Level::factory()->create(['key' => 'level-99-retired', 'sort' => 99]);

    $this->artisan('game:levels:sync')->assertExitCode(0);

    expect($retired->fresh())->not->toBeNull()
        ->and(Level::count())->toBe(3);
});

it('writes nothing when a file fails the schema', function () {
    $root = scratchLevels();
    $path = $root.'/levels/level-02-too-much-powder.json';
    $config = json_decode((string) File::get($path));
    $config->clipboardSeconds = 'three';
    File::put($path, json_encode($config, JSON_THROW_ON_ERROR));

    $this->artisan('game:levels:sync')
        ->expectsOutputToContain('/clipboardSeconds')
        ->assertExitCode(1);

    expect(Level::count())->toBe(0);
});

it('writes nothing when a file key does not match its stem', function () {
    $root = scratchLevels();
    $path = $root.'/levels/level-02-too-much-powder.json';
    $config = json_decode((string) File::get($path));
    $config->key = 'something-else';
    File::put($path, json_encode($config, JSON_THROW_ON_ERROR));

    $this->artisan('game:levels:sync')
        ->expectsOutputToContain('key')
        ->assertExitCode(1);

    expect(Level::count())->toBe(0);
});

it('writes nothing when a level names a layout that is not on disk', function () {
    $root = scratchLevels();
    File::delete($root.'/layouts/one-line.json');

    $this->artisan('game:levels:sync')
        ->expectsOutputToContain('one-line')
        ->assertExitCode(1);

    expect(Level::count())->toBe(0);
});

it('writes nothing when a file is not valid JSON', function () {
    $root = scratchLevels();
    File::put($root.'/levels/level-02-too-much-powder.json', '{ not json');

    $this->artisan('game:levels:sync')->assertExitCode(1);

    expect(Level::count())->toBe(0);
});

it('succeeds with an empty level directory', function () {
    $root = scratchLevels();
    File::cleanDirectory($root.'/levels');

    $this->artisan('game:levels:sync')->assertExitCode(0);

    expect(Level::count())->toBe(0);
});
