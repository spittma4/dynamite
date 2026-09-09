<?php

declare(strict_types=1);

use App\Livewire\Admin\Levels\Edit;
use App\Livewire\Admin\Levels\Index;
use App\Models\Level;
use App\Models\User;
use Livewire\Livewire;

beforeEach(function (): void {
    $this->admin = User::factory()->create(['is_admin' => true]);
    $this->level = Level::factory()->create(['key' => 'level-01-basic-flow', 'name' => 'Basic Flow', 'sort' => 1]);
});

it('forbids a non-admin from the level list', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('admin.levels.index'))
        ->assertForbidden();
});

it('forbids a non-admin from the editor', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('admin.levels.edit', $this->level))
        ->assertForbidden();
});

it('lists every level with its key and sort', function () {
    Level::factory()->inactive()->create(['key' => 'level-02-too-much-powder', 'name' => 'Too Much Powder', 'sort' => 2]);

    $this->actingAs($this->admin)
        ->get(route('admin.levels.index'))
        ->assertOk()
        ->assertSeeInOrder(['level-01-basic-flow', 'level-02-too-much-powder']);
});

it('toggles a level between active and inactive', function () {
    Livewire::actingAs($this->admin)
        ->test(Index::class)
        ->call('toggleActive', $this->level->id);

    expect($this->level->fresh()->is_active)->toBeFalse();

    Livewire::actingAs($this->admin)
        ->test(Index::class)
        ->call('toggleActive', $this->level->id);

    expect($this->level->fresh()->is_active)->toBeTrue();
});

it('opens the editor with the config pretty printed', function () {
    Livewire::actingAs($this->admin)
        ->test(Edit::class, ['level' => $this->level])
        ->assertSet('json', json_encode(
            $this->level->config,
            JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_SLASHES
        ));
});

it('rejects text that is not JSON', function () {
    Livewire::actingAs($this->admin)
        ->test(Edit::class, ['level' => $this->level])
        ->set('json', '{ not json')
        ->call('save')
        ->assertHasErrors('json');

    expect($this->level->fresh()->name)->toBe('Basic Flow');
});

it('lists schema errors by JSON pointer', function () {
    $config = $this->level->config;
    $config->clipboardSeconds = 'three';

    Livewire::actingAs($this->admin)
        ->test(Edit::class, ['level' => $this->level])
        ->set('json', json_encode($config, JSON_THROW_ON_ERROR))
        ->call('validateJson')
        ->assertSee('/clipboardSeconds');
});

it('refuses a config whose key does not match the level', function () {
    $config = $this->level->config;
    $config->key = 'something-else';

    Livewire::actingAs($this->admin)
        ->test(Edit::class, ['level' => $this->level])
        ->set('json', json_encode($config, JSON_THROW_ON_ERROR))
        ->call('save')
        ->assertHasErrors('json');

    expect($this->level->fresh()->config->key)->toBe('level-01-basic-flow');
});

it('saves a valid config and takes the name from it', function () {
    $config = $this->level->config;
    $config->name = 'Basic Flow, Revised';
    $config->clipboardSeconds = 4;

    Livewire::actingAs($this->admin)
        ->test(Edit::class, ['level' => $this->level])
        ->set('json', json_encode($config, JSON_THROW_ON_ERROR))
        ->call('save')
        ->assertHasNoErrors();

    expect($this->level->fresh())
        ->name->toBe('Basic Flow, Revised')
        ->and($this->level->fresh()->config->clipboardSeconds)->toBe(4)
        ->and($this->level->fresh()->config->recipes->keg->inputs)->toBeInstanceOf(stdClass::class);
});

it('reports a config with no schema errors as valid', function () {
    Livewire::actingAs($this->admin)
        ->test(Edit::class, ['level' => $this->level])
        ->call('validateJson')
        ->assertHasNoErrors()
        ->assertSee('Valid');
});

it('forbids a user who has lost admin from toggling a level', function () {
    $component = Livewire::actingAs($this->admin)->test(Index::class);

    $this->admin->forceFill(['is_admin' => false])->save();

    $component->call('toggleActive', $this->level->id)->assertForbidden();

    expect($this->level->fresh()->is_active)->toBeTrue();
});

it('forbids a user who has lost admin from saving a level', function () {
    $component = Livewire::actingAs($this->admin)->test(Edit::class, ['level' => $this->level]);

    $this->admin->forceFill(['is_admin' => false])->save();

    $component->call('save')->assertForbidden();

    expect($this->level->fresh()->name)->toBe('Basic Flow');
});
