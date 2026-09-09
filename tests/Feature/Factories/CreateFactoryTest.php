<?php

declare(strict_types=1);

use App\Enums\FactoryRole;
use App\Livewire\Factories\Create;
use App\Models\Factory;
use App\Models\User;
use Livewire\Livewire;

it('redirects a guest to the login page', function () {
    $this->get(route('factories.create'))->assertRedirect(route('login'));
});

it('creates a factory with the creator as its owner', function () {
    $user = User::factory()->create();

    Livewire::actingAs($user)
        ->test(Create::class)
        ->set('name', 'Kaboom & Sons')
        ->call('create')
        ->assertRedirect(route('factories.show', Factory::sole()));

    $factory = Factory::sole();

    expect($factory->name)->toBe('Kaboom & Sons')
        ->and($factory->owner_id)->toBe($user->id)
        ->and($factory->day)->toBe(1)
        ->and($factory->coin)->toBe(0)
        ->and($factory->unlocked_level)->toBe(1)
        ->and($factory->level_id)->toBeNull()
        ->and($factory->members->sole()->id)->toBe($user->id)
        ->and($factory->members->sole()->pivot->role)->toBe(FactoryRole::Owner->value);
});

it('gives the factory a six character join code from the unambiguous alphabet', function () {
    Livewire::actingAs(User::factory()->create())
        ->test(Create::class)
        ->set('name', 'Kaboom & Sons')
        ->call('create');

    expect(Factory::sole()->join_code)->toMatch('/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/');
});

it('rejects a name shorter than two characters', function () {
    Livewire::actingAs(User::factory()->create())
        ->test(Create::class)
        ->set('name', 'K')
        ->call('create')
        ->assertHasErrors(['name' => 'min']);

    expect(Factory::count())->toBe(0);
});

it('rejects a name longer than forty characters', function () {
    Livewire::actingAs(User::factory()->create())
        ->test(Create::class)
        ->set('name', str_repeat('a', 41))
        ->call('create')
        ->assertHasErrors(['name' => 'max']);
});
