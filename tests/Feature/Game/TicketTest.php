<?php

declare(strict_types=1);

use App\Models\Factory;
use App\Models\User;

/**
 * @return array{0: array<string, mixed>, 1: string}
 */
function decodeTicket(string $ticket): array
{
    [$payload, $signature] = explode('.', $ticket, 2);

    $json = base64_decode(strtr($payload, '-_', '+/').str_repeat('=', (4 - mb_strlen($payload) % 4) % 4), true);

    return [json_decode((string) $json, true, 512, JSON_THROW_ON_ERROR), $signature];
}

it('issues a signed ticket to a member', function () {
    $this->freezeTime();

    $factory = Factory::factory()->create();

    $response = $this->actingAs($factory->owner)
        ->postJson(route('game.ticket'), ['factory_id' => $factory->id]);

    $response->assertOk()->assertJsonStructure(['ticket', 'ws_url', 'room']);

    expect($response->json('room'))->toBe('factory')
        ->and($response->json('ws_url'))->toBe(config('game.ws_url'));

    [$claims, $signature] = decodeTicket($response->json('ticket'));

    expect($claims)->toBe([
        'userId' => $factory->owner->id,
        'factoryId' => $factory->id,
        'name' => $factory->owner->name,
        'exp' => now()->addSeconds(60)->timestamp,
    ]);

    $encoded = explode('.', $response->json('ticket'))[0];

    expect($signature)->toBe(hash_hmac('sha256', $encoded, 'test-secret'));
});

it('truncates a display name longer than thirty-two characters', function () {
    $user = User::factory()->create(['name' => str_repeat('Bartholomew ', 5)]);
    $factory = Factory::factory()->for($user, 'owner')->create();

    $response = $this->actingAs($user)->postJson(route('game.ticket'), ['factory_id' => $factory->id]);

    [$claims] = decodeTicket($response->json('ticket'));

    expect($claims['name'])->toHaveLength(32)
        ->and($claims['name'])->toBe(mb_substr(trim($user->name), 0, 32));
});

it('forbids a user who is not a member', function () {
    $factory = Factory::factory()->create();

    $this->actingAs(User::factory()->create())
        ->postJson(route('game.ticket'), ['factory_id' => $factory->id])
        ->assertForbidden();
});

it('rejects an unknown factory id', function () {
    $this->actingAs(User::factory()->create())
        ->postJson(route('game.ticket'), ['factory_id' => 404])
        ->assertStatus(422)
        ->assertJsonValidationErrors('factory_id');
});

it('rejects a missing factory id', function () {
    $this->actingAs(User::factory()->create())
        ->postJson(route('game.ticket'), [])
        ->assertStatus(422)
        ->assertJsonValidationErrors('factory_id');
});

it('returns 401 to an unauthenticated JSON request', function () {
    $this->postJson(route('game.ticket'), ['factory_id' => 1])->assertUnauthorized();
});

it('fails loudly when the shared secret is not configured', function () {
    config(['game.secret' => '']);
    $factory = Factory::factory()->create();

    $this->withoutExceptionHandling()
        ->actingAs($factory->owner)
        ->postJson(route('game.ticket'), ['factory_id' => $factory->id]);
})->throws(RuntimeException::class, 'GAME_SERVER_SECRET is not set');
