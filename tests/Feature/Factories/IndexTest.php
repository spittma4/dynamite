<?php

declare(strict_types=1);

use App\Models\Factory;
use App\Models\User;

it('redirects a guest to the login page', function () {
    $this->get(route('factories.index'))->assertRedirect(route('login'));
});

it('lists only the factories the user belongs to', function () {
    $user = User::factory()->create();
    $mine = Factory::factory()->for($user, 'owner')->create(['name' => 'Kaboom & Sons']);
    $theirs = Factory::factory()->create(['name' => 'Rival Fireworks']);

    $this->actingAs($user)
        ->get(route('factories.index'))
        ->assertOk()
        ->assertSee($mine->name)
        ->assertDontSee($theirs->name);
});
