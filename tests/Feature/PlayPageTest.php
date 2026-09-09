<?php

declare(strict_types=1);

use App\Models\Factory;
use App\Models\Level;
use App\Models\User;

beforeEach(function (): void {
    $this->withoutVite();
    config(['app.debug' => false]);

    $this->level = Level::factory()->create(['sort' => 1]);
    $this->factory = Factory::factory()->create(['level_id' => $this->level->id]);
});

it('renders the mount div with the six attributes the client reads', function () {
    $this->actingAs($this->factory->owner)
        ->get(route('factories.play', $this->factory))
        ->assertOk()
        ->assertSee('id="game"', false)
        ->assertSee('data-ticket-url="'.route('game.ticket').'"', false)
        ->assertSee('data-factory-id="'.$this->factory->id.'"', false)
        ->assertSee('data-ws-url="'.config('game.ws_url').'"', false)
        ->assertSee('data-csrf="', false)
        ->assertSee('data-debug="0"', false)
        ->assertSee('data-factory-url="'.route('factories.show', $this->factory).'"', false);
});

it('turns debug on for a query parameter', function () {
    $this->actingAs($this->factory->owner)
        ->get(route('factories.play', $this->factory).'?debug=1')
        ->assertSee('data-debug="1"', false);
});

it('turns debug on when the application is in debug mode', function () {
    config(['app.debug' => true]);

    $this->actingAs($this->factory->owner)
        ->get(route('factories.play', $this->factory))
        ->assertSee('data-debug="1"', false);
});

it('turns debug on for a sandbox level', function () {
    $this->factory->update(['level_id' => Level::factory()->sandbox()->create(['sort' => 9])->id]);

    $this->actingAs($this->factory->owner)
        ->get(route('factories.play', $this->factory))
        ->assertSee('data-debug="1"', false);
});

it('forbids a user who is not a member', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('factories.play', $this->factory))
        ->assertForbidden();
});

it('returns 404 for an unknown factory', function () {
    $this->actingAs(User::factory()->create())
        ->get('/factories/404/play')
        ->assertNotFound();
});

it('redirects a guest to the login page', function () {
    $this->get(route('factories.play', $this->factory))->assertRedirect(route('login'));
});

it('sends the player back to the factory when no level is playable', function () {
    Level::query()->update(['is_active' => false]);

    $this->actingAs($this->factory->owner)
        ->get(route('factories.play', $this->factory))
        ->assertRedirect(route('factories.show', $this->factory))
        ->assertSessionHas('error', 'Pick a level first.');
});
