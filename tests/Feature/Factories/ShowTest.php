<?php

declare(strict_types=1);

use App\Enums\FactoryRole;
use App\Enums\RunStatus;
use App\Livewire\Factories\Show;
use App\Models\Factory;
use App\Models\Level;
use App\Models\User;
use Database\Factories\RunFactory;
use Livewire\Livewire;

beforeEach(function (): void {
    $this->factory = Factory::factory()->create(['name' => 'Kaboom & Sons', 'unlocked_level' => 1]);
    $this->owner = $this->factory->owner;
});

it('redirects a guest to the login page', function () {
    $this->get(route('factories.show', $this->factory))->assertRedirect(route('login'));
});

it('forbids a user who is not a member', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('factories.show', $this->factory))
        ->assertForbidden();
});

it('returns 404 for an unknown factory', function () {
    $this->actingAs(User::factory()->create())->get('/factories/404')->assertNotFound();
});

it('shows the members, their roles and the join code', function () {
    $mate = User::factory()->create(['name' => 'Priya']);
    $this->factory->addMember($mate, FactoryRole::Member);

    $this->actingAs($this->owner)
        ->get(route('factories.show', $this->factory))
        ->assertOk()
        ->assertSee('Kaboom & Sons')
        ->assertSee($this->owner->name)
        ->assertSee('Priya')
        ->assertSee($this->factory->join_code)
        ->assertSeeInOrder([$this->owner->name, 'Priya']);
});

it('lists the active levels in sort order and marks the locked ones', function () {
    Level::factory()->create(['sort' => 1, 'name' => 'Basic Flow']);
    Level::factory()->create(['sort' => 2, 'name' => 'Too Much Powder']);
    Level::factory()->inactive()->create(['sort' => 3, 'name' => 'Retired Level']);

    Livewire::actingAs($this->owner)
        ->test(Show::class, ['factory' => $this->factory])
        ->assertSeeInOrder(['Basic Flow', 'Too Much Powder'])
        ->assertDontSee('Retired Level')
        ->assertSee('Too Much Powder — locked');
});

it('never locks the sandbox level', function () {
    Level::factory()->sandbox()->create(['sort' => 9, 'name' => 'Sandbox']);

    Livewire::actingAs($this->owner)
        ->test(Show::class, ['factory' => $this->factory])
        ->assertDontSee('Sandbox — locked');
});

it('persists a level selection', function () {
    $first = Level::factory()->create(['sort' => 1]);
    $second = Level::factory()->create(['sort' => 2]);
    $this->factory->update(['unlocked_level' => 2]);

    Livewire::actingAs($this->owner)
        ->test(Show::class, ['factory' => $this->factory])
        ->assertSet('levelId', $first->id)
        ->set('levelId', $second->id)
        ->assertHasNoErrors();

    expect($this->factory->fresh()->level_id)->toBe($second->id);
});

it('refuses to select a locked level', function () {
    $first = Level::factory()->create(['sort' => 1]);
    $locked = Level::factory()->create(['sort' => 2]);

    Livewire::actingAs($this->owner)
        ->test(Show::class, ['factory' => $this->factory])
        ->set('levelId', $locked->id)
        ->assertHasErrors('levelId')
        ->assertSet('levelId', $first->id);

    expect($this->factory->fresh()->level_id)->toBeNull();
});

it('shows the twenty most recently finished runs newest first', function () {
    $level = Level::factory()->create(['sort' => 1, 'name' => 'Basic Flow']);

    RunFactory::new()
        ->count(21)
        ->for($this->factory)
        ->for($level)
        ->sequence(fn ($sequence) => [
            'day' => $sequence->index + 1,
            'ended_at' => now()->subDays(21 - $sequence->index),
        ])
        ->create();

    $rendered = Livewire::actingAs($this->owner)
        ->test(Show::class, ['factory' => $this->factory]);

    $rendered->assertSee('Day 21')->assertDontSee('Day 1"');

    expect($rendered->viewData('runs'))->toHaveCount(20)
        ->and($rendered->viewData('runs')->first()->day)->toBe(21);
});

it('shows a run with its grade, status, profit and coin', function () {
    $level = Level::factory()->create(['sort' => 1, 'name' => 'Basic Flow']);

    RunFactory::new()->for($this->factory)->for($level)->create([
        'day' => 4,
        'grade' => 'B',
        'status' => RunStatus::Exploded,
        'profit' => -80,
        'coin_earned' => 0,
    ]);

    Livewire::actingAs($this->owner)
        ->test(Show::class, ['factory' => $this->factory])
        ->assertSee('Basic Flow')
        ->assertSee('exploded')
        ->assertSee('-80');
});

it('disables entering the factory when no level is playable', function () {
    Livewire::actingAs($this->owner)
        ->test(Show::class, ['factory' => $this->factory])
        ->assertSee('Sync levels first')
        ->assertDontSee(route('factories.play', $this->factory));
});

it('links to the play page when a level is playable', function () {
    Level::factory()->create(['sort' => 1]);

    Livewire::actingAs($this->owner)
        ->test(Show::class, ['factory' => $this->factory])
        ->assertSee(route('factories.play', $this->factory));
});

it('forbids a non-member from mounting the component', function () {
    Livewire::actingAs(User::factory()->create())
        ->test(Show::class, ['factory' => $this->factory])
        ->assertForbidden();
});

it('forbids a former member from setting the level', function () {
    $level = Level::factory()->create(['sort' => 1]);
    $mate = User::factory()->create();
    $this->factory->addMember($mate, FactoryRole::Member);

    $component = Livewire::actingAs($mate)->test(Show::class, ['factory' => $this->factory]);

    $this->factory->members()->detach($mate->id);

    $component->set('levelId', $level->id)->assertForbidden();

    expect($this->factory->fresh()->level_id)->toBeNull();
});
