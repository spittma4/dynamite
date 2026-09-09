<?php

declare(strict_types=1);

use App\Models\Factory;
use App\Models\Level;

/**
 * The rest of the suite syncs fixtures. This file syncs the files we actually
 * ship, against the schema the game server validates with, so a level that
 * only ever passes vitest cannot reach a player through Laravel.
 */
beforeEach(function (): void {
    config([
        'game.levels_path' => base_path('config/game/levels'),
        'game.layouts_path' => base_path('config/game/layouts'),
        'game.schema_path' => base_path('shared/src/config/schema.json'),
    ]);
});

it('syncs the five shipped level files in order with sorts one to five', function () {
    $this->artisan('game:levels:sync')->assertExitCode(0);

    $levels = Level::orderBy('sort')->get();

    expect($levels->pluck('key')->all())->toBe([
        'level-01-basic-flow',
        'level-02-too-much-powder',
        'level-03-the-bottleneck',
        'level-04-too-many-helpers',
        'sandbox',
    ])
        ->and($levels->pluck('sort')->all())->toBe([1, 2, 3, 4, 5])
        ->and($levels->pluck('name')->all())->toBe([
            'Basic Flow',
            'Too Much Powder',
            'The Bottleneck',
            'Too Many Helpers',
            'Sandbox',
        ]);
});

it('names every level after its file and its stored config', function () {
    $this->artisan('game:levels:sync')->assertExitCode(0);

    Level::all()->each(function (Level $level): void {
        expect($level->config->key)->toBe($level->key)
            ->and($level->config->name)->toBe($level->name);
    });
});

it('stores the one-line layout beside every level', function () {
    $this->artisan('game:levels:sync')->assertExitCode(0);

    Level::all()->each(function (Level $level): void {
        expect($level->config->layout)->toBe('one-line')
            ->and($level->layout->key)->toBe('one-line')
            ->and($level->layout->width)->toBe(28)
            ->and($level->layout->height)->toBe(18);
    });
});

it('marks only sandbox as a sandbox', function () {
    $this->artisan('game:levels:sync')->assertExitCode(0);

    expect(Level::all()->filter->isSandbox()->pluck('key')->all())->toBe(['sandbox']);
});

it('unlocks exactly basic flow and sandbox for a fresh factory', function () {
    $this->artisan('game:levels:sync')->assertExitCode(0);

    $factory = Factory::factory()->create(['unlocked_level' => 1]);

    $unlocked = Level::orderBy('sort')->get()
        ->filter(fn (Level $level): bool => $level->isUnlockedFor($factory))
        ->pluck('key')
        ->all();

    expect($unlocked)->toBe(['level-01-basic-flow', 'sandbox']);
});

it('re-syncs the shipped files without changing anything', function () {
    $this->artisan('game:levels:sync')->assertExitCode(0);

    $before = Level::orderBy('sort')->get()->map->only(['key', 'name', 'sort'])->all();

    $this->artisan('game:levels:sync')
        ->expectsOutputToContain('updated sandbox')
        ->assertExitCode(0);

    expect(Level::orderBy('sort')->get()->map->only(['key', 'name', 'sort'])->all())->toBe($before)
        ->and(Level::count())->toBe(5);
});
