<?php

declare(strict_types=1);

use App\Actions\JoinFactoryByCode;
use App\Enums\FactoryRole;
use App\Exceptions\UnknownJoinCode;
use App\Livewire\Factories\Join;
use App\Models\Factory;
use App\Models\User;
use Livewire\Livewire;

it('joins a factory by its code', function () {
    $factory = Factory::factory()->create(['join_code' => 'BANG42']);
    $user = User::factory()->create();

    Livewire::actingAs($user)
        ->test(Join::class)
        ->set('code', 'BANG42')
        ->call('join')
        ->assertRedirect(route('factories.show', $factory));

    expect($factory->fresh()->members->firstWhere('id', $user->id)->pivot->role)
        ->toBe(FactoryRole::Member->value);
});

it('normalises case, spaces and hyphens in the code', function (string $typed) {
    $factory = Factory::factory()->create(['join_code' => 'BANG42']);
    $user = User::factory()->create();

    Livewire::actingAs($user)
        ->test(Join::class)
        ->set('code', $typed)
        ->call('join')
        ->assertRedirect(route('factories.show', $factory));

    expect($factory->isMember($user))->toBeTrue();
})->with([
    'lowercase with a space' => 'bang 42',
    'hyphenated' => 'BANG-42',
    'padded' => '  bang42  ',
]);

it('shows an error for an unknown code', function () {
    $user = User::factory()->create();

    Livewire::actingAs($user)
        ->test(Join::class)
        ->set('code', 'ZZZZZZ')
        ->call('join')
        ->assertHasErrors('code')
        ->assertNoRedirect();

    expect($user->factories()->count())->toBe(0);
});

it('does not duplicate an existing membership', function () {
    $factory = Factory::factory()->create(['join_code' => 'BANG42']);
    $owner = $factory->owner;

    Livewire::actingAs($owner)
        ->test(Join::class)
        ->set('code', 'BANG42')
        ->call('join')
        ->assertRedirect(route('factories.show', $factory));

    expect($factory->fresh()->members)->toHaveCount(1)
        ->and($factory->fresh()->members->sole()->pivot->role)->toBe(FactoryRole::Owner->value);
});

it('throws for an unknown code at the action level', function () {
    app(JoinFactoryByCode::class)->handle(User::factory()->create(), 'ZZZZZZ');
})->throws(UnknownJoinCode::class);
