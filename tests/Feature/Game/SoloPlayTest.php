<?php

declare(strict_types=1);

use App\Models\Level;

/**
 * ADR 0013 — solo and duo are the taster. Level 1 has to be finishable by one
 * person, which means a small-crew breakpoint, not merely a lowered gate.
 */
it('lets a single player start level 1', function () {
    $config = json_decode(json_encode(Level::factory()->create()->config), true);

    expect($config['players']['min'])->toBe(1);
});

it('tunes level 1 for a small crew so a solo book is finishable', function () {
    $config = json_decode(json_encode(Level::factory()->create()->config), true);

    $small = collect($config['scaling']['breakpoints'])
        ->firstWhere(fn (array $b): bool => $b['maxPlayers'] <= 2);

    expect($small)->not->toBeNull()
        ->and($small['orderBook'])->toBeLessThanOrEqual(5)
        ->and($small['qtyPerTruck']['base'])->toBeLessThanOrEqual(4)
        ->and($small['truckEverySeconds'])->toBeGreaterThanOrEqual(75);
});

it('keeps the full-crew breakpoint intact for three or more', function () {
    $config = json_decode(json_encode(Level::factory()->create()->config), true);

    $full = collect($config['scaling']['breakpoints'])
        ->firstWhere(fn (array $b): bool => $b['maxPlayers'] === 6);

    expect($full)->not->toBeNull()
        ->and($full['orderBook'])->toBeGreaterThan(5);
});
