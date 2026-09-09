<?php

declare(strict_types=1);

use App\Enums\FactoryRole;
use App\Game\InternalSignature;
use App\Models\Factory;
use App\Models\Level;
use App\Models\User;

it('returns the factory, its level, its layout and its members', function () {
    $owner = User::factory()->create(['name' => 'Sam']);
    $mate = User::factory()->create(['name' => 'Priya']);
    $level = Level::factory()->create(['sort' => 1]);
    $factory = Factory::factory()->for($owner, 'owner')->create([
        'name' => 'Kaboom & Sons',
        'day' => 3,
        'coin' => 120,
        'level_id' => $level->id,
    ]);
    $factory->addMember($mate, FactoryRole::Member);

    $response = signedCall('GET', "/internal/factories/{$factory->id}/config");

    $response->assertOk()->assertExactJson([
        'factory' => [
            'id' => $factory->id,
            'name' => 'Kaboom & Sons',
            'day' => 3,
            'coin' => 120,
            'ownerUserId' => $owner->id,
        ],
        'level' => json_decode(json_encode($level->config), true),
        'layout' => json_decode(json_encode($level->layout), true),
        'members' => [
            ['userId' => $mate->id, 'name' => 'Priya'],
            ['userId' => $owner->id, 'name' => 'Sam'],
        ],
    ]);
});

it('sends the owner id and member ids as integers', function () {
    $factory = Factory::factory()->create(['level_id' => Level::factory()->create(['sort' => 1])->id]);

    $body = signedCall('GET', "/internal/factories/{$factory->id}/config")->json();

    expect($body['factory']['ownerUserId'])->toBeInt()
        ->and($body['members'][0]['userId'])->toBeInt();
});

it('falls back to the lowest sort active level when none is selected', function () {
    Level::factory()->create(['sort' => 2, 'key' => 'second']);
    $first = Level::factory()->create(['sort' => 1, 'key' => 'first']);
    $factory = Factory::factory()->create(['level_id' => null]);

    signedCall('GET', "/internal/factories/{$factory->id}/config")
        ->assertOk()
        ->assertJsonPath('level.key', $first->config->key);
});

it('ignores a selected level that is no longer active', function () {
    $active = Level::factory()->create(['sort' => 1, 'key' => 'first']);
    $retired = Level::factory()->inactive()->create(['sort' => 9, 'key' => 'retired']);
    $factory = Factory::factory()->create(['level_id' => $retired->id]);

    signedCall('GET', "/internal/factories/{$factory->id}/config")
        ->assertOk()
        ->assertJsonPath('level.key', $active->config->key);
});

it('returns 404 no_active_level when nothing is playable', function () {
    Level::factory()->inactive()->create(['sort' => 1]);
    $factory = Factory::factory()->create(['level_id' => null]);

    signedCall('GET', "/internal/factories/{$factory->id}/config")
        ->assertNotFound()
        ->assertExactJson(['error' => 'no_active_level']);
});

it('returns 404 not_found for an unknown factory', function () {
    signedCall('GET', '/internal/factories/404/config')
        ->assertNotFound()
        ->assertExactJson(['error' => 'not_found']);
});

it('keeps an empty object in the level config an object', function () {
    $factory = Factory::factory()->create(['level_id' => Level::factory()->create(['sort' => 1])->id]);

    $raw = signedCall('GET', "/internal/factories/{$factory->id}/config")->getContent();

    expect($raw)->toContain('"inputs":{}');
});

it('rejects a players count outside one to ten', function () {
    $factory = Factory::factory()->create(['level_id' => Level::factory()->create(['sort' => 1])->id]);

    signedCall('GET', "/internal/factories/{$factory->id}/config?players=11")
        ->assertStatus(422)
        ->assertJsonValidationErrors('players');
});

it('accepts a players count between one and ten', function () {
    $factory = Factory::factory()->create(['level_id' => Level::factory()->create(['sort' => 1])->id]);

    signedCall('GET', "/internal/factories/{$factory->id}/config?players=4")->assertOk();
});

it('rejects an unsigned request', function () {
    $factory = Factory::factory()->create(['level_id' => Level::factory()->create(['sort' => 1])->id]);

    $this->getJson("/internal/factories/{$factory->id}/config")
        ->assertUnauthorized()
        ->assertExactJson(['error' => 'invalid_signature']);
});

it('rejects a signature that covers the path with its query string', function () {
    $factory = Factory::factory()->create(['level_id' => Level::factory()->create(['sort' => 1])->id]);
    $uri = "/internal/factories/{$factory->id}/config?players=4";

    $this->withHeader('X-Dynamite-Signature', InternalSignature::sign('GET', $uri, '', 'test-secret'))
        ->getJson($uri)
        ->assertUnauthorized()
        ->assertExactJson(['error' => 'invalid_signature']);
});
