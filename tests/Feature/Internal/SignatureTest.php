<?php

declare(strict_types=1);

use App\Game\InternalSignature;
use App\Http\Middleware\EnsureGameServerSignature;
use Illuminate\Support\Facades\Route;

beforeEach(function (): void {
    config(['game.secret' => 'test-secret']);

    Route::middleware(EnsureGameServerSignature::class)->group(function (): void {
        Route::get('/internal/echo', fn () => response()->json(['ok' => true]));
        Route::post('/internal/echo', fn () => response()->json(['ok' => true]));
    });
});

it('returns 401 when the signature header is missing', function () {
    $this->get('/internal/echo')
        ->assertUnauthorized()
        ->assertExactJson(['error' => 'invalid_signature']);
});

it('returns 401 for a wrong signature', function () {
    $this->withHeader('X-Dynamite-Signature', str_repeat('a', 64))
        ->get('/internal/echo')
        ->assertUnauthorized()
        ->assertExactJson(['error' => 'invalid_signature']);
});

it('returns 401 when the signature covers a different body', function () {
    $signature = InternalSignature::sign('POST', '/internal/echo', '{"seed":1}', 'test-secret');

    $this->call('POST', '/internal/echo', [], [], [], [
        'HTTP_X-Dynamite-Signature' => $signature,
        'CONTENT_TYPE' => 'application/json',
    ], '{"seed":2}')
        ->assertUnauthorized();
});

it('returns 401 when the signature included the query string', function () {
    $signature = InternalSignature::sign('GET', '/internal/echo?players=4', '', 'test-secret');

    $this->withHeader('X-Dynamite-Signature', $signature)
        ->get('/internal/echo?players=4')
        ->assertUnauthorized();
});

it('accepts a signature over the path without its query string', function () {
    $signature = InternalSignature::sign('GET', '/internal/echo', '', 'test-secret');

    $this->withHeader('X-Dynamite-Signature', $signature)
        ->get('/internal/echo?players=4')
        ->assertOk()
        ->assertExactJson(['ok' => true]);
});

it('accepts an uppercase hex signature', function () {
    $signature = InternalSignature::sign('GET', '/internal/echo', '', 'test-secret');

    $this->withHeader('X-Dynamite-Signature', mb_strtoupper($signature))
        ->get('/internal/echo')
        ->assertOk();
});

it('accepts a signature over the raw request body', function () {
    $body = '{"seed":1}';
    $signature = InternalSignature::sign('POST', '/internal/echo', $body, 'test-secret');

    $this->call('POST', '/internal/echo', [], [], [], [
        'HTTP_X-Dynamite-Signature' => $signature,
        'CONTENT_TYPE' => 'application/json',
    ], $body)
        ->assertOk();
});

it('renders the rejection as JSON without an Accept header', function () {
    $response = $this->call('GET', '/internal/echo', [], [], [], ['HTTP_ACCEPT' => 'text/html']);

    expect($response->headers->get('Content-Type'))->toStartWith('application/json');
    $response->assertUnauthorized()->assertExactJson(['error' => 'invalid_signature']);
});

it('fails loudly when the shared secret is not configured', function () {
    config(['game.secret' => '']);

    $this->withoutExceptionHandling()->get('/internal/echo');
})->throws(RuntimeException::class, 'GAME_SERVER_SECRET is not set');
