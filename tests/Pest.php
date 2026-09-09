<?php

use App\Game\InternalSignature;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->beforeEach(function (): void {
        config([
            'game.secret' => 'test-secret',
            'game.schema_path' => base_path('tests/Fixtures/game/level.schema.json'),
            'game.levels_path' => base_path('tests/Fixtures/game/levels'),
            'game.layouts_path' => base_path('tests/Fixtures/game/layouts'),
        ]);
    })
    ->in('Feature');

pest()->extend(TestCase::class)->in('Unit');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

/**
 * Call an internal route the way the game server does: HMAC over the method,
 * the path without its query string, and the exact bytes of the body.
 *
 * @param  array<string, mixed>|null  $body
 */
function signedCall(string $method, string $uri, ?array $body = null): TestResponse
{
    $payload = $body === null ? '' : json_encode($body, JSON_THROW_ON_ERROR);

    $signature = InternalSignature::sign(
        $method,
        (string) parse_url($uri, PHP_URL_PATH),
        $payload,
        (string) config('game.secret'),
    );

    return test()->call($method, $uri, [], [], [], [
        'HTTP_X-Dynamite-Signature' => $signature,
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
    ], $payload);
}
