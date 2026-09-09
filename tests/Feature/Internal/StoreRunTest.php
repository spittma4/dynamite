<?php

declare(strict_types=1);

use App\Enums\RunStatus;
use App\Models\Factory;
use App\Models\Level;
use App\Models\Run;
use App\Models\User;

/**
 * @param  array<string, mixed>  $overrides
 * @return array<string, mixed>
 */
function runPayload(array $overrides = []): array
{
    $payload = json_decode(
        (string) file_get_contents(base_path('tests/Fixtures/game/run.json')),
        true,
        512,
        JSON_THROW_ON_ERROR
    );

    return array_replace_recursive($payload, $overrides);
}

beforeEach(function (): void {
    $this->level = Level::factory()->create(['key' => 'level-01-basic-flow', 'sort' => 1]);
    Level::factory()->create(['key' => 'level-02-too-much-powder', 'sort' => 2]);
    $this->factory = Factory::factory()->create(['day' => 1, 'coin' => 5, 'unlocked_level' => 1]);
});

it('stores the run, its players and the whole payload', function () {
    $sam = User::factory()->create();
    $priya = User::factory()->create();

    $payload = runPayload([
        'factoryId' => (string) $this->factory->id,
        'players' => [['userId' => (string) $sam->id], ['userId' => (string) $priya->id]],
    ]);

    $response = signedCall('POST', '/internal/runs', $payload);

    $response->assertCreated();

    $run = Run::sole();

    expect($response->json())->toBe(['ok' => true, 'runId' => $run->id])
        ->and($run->factory_id)->toBe($this->factory->id)
        ->and($run->level_id)->toBe($this->level->id)
        ->and($run->day)->toBe(1)
        ->and($run->seed)->toBe(987654321)
        ->and($run->status)->toBe(RunStatus::Ended)
        ->and($run->grade)->toBe('C')
        ->and($run->profit)->toBe(192)
        ->and($run->coin_earned)->toBe(19)
        ->and($run->metrics)->toBe($payload)
        ->and($run->started_at->toIso8601ZuluString('millisecond'))->toBe('2026-09-04T20:15:00.000Z');

    expect($run->players->pluck('id')->all())->toEqualCanonicalizing([$sam->id, $priya->id])
        ->and($run->players->firstWhere('id', $sam->id)->pivot->stats)
        ->toBe(json_encode($payload['players'][0], JSON_THROW_ON_ERROR));
});

it('advances the day and credits the coin for an ended run', function () {
    signedCall('POST', '/internal/runs', runPayload(['factoryId' => (string) $this->factory->id]))
        ->assertCreated();

    expect($this->factory->fresh())
        ->day->toBe(2)
        ->coin->toBe(24);
});

it('advances the day for an exploded run', function () {
    $payload = runPayload([
        'factoryId' => (string) $this->factory->id,
        'status' => 'exploded',
        'grade' => 'F',
        'pnl' => ['profit' => -80, 'coin' => 0],
    ]);

    signedCall('POST', '/internal/runs', $payload)->assertCreated();

    expect($this->factory->fresh())
        ->day->toBe(2)
        ->coin->toBe(5)
        ->unlocked_level->toBe(1);
});

it('leaves the factory untouched for an abandoned run', function () {
    $payload = runPayload(['factoryId' => (string) $this->factory->id, 'status' => 'abandoned']);

    signedCall('POST', '/internal/runs', $payload)->assertCreated();

    expect($this->factory->fresh())
        ->day->toBe(1)
        ->coin->toBe(5)
        ->unlocked_level->toBe(1);
});

it('unlocks the next level when the grade meets advanceOn', function () {
    signedCall('POST', '/internal/runs', runPayload(['factoryId' => (string) $this->factory->id]))
        ->assertCreated();

    expect($this->factory->fresh()->unlocked_level)->toBe(2);
});

it('does not unlock the next level on a grade below advanceOn', function () {
    signedCall('POST', '/internal/runs', runPayload(['factoryId' => (string) $this->factory->id, 'grade' => 'D']))
        ->assertCreated();

    expect($this->factory->fresh()->unlocked_level)->toBe(1);
});

it('never lowers unlocked_level', function () {
    $this->factory->update(['unlocked_level' => 2]);

    signedCall('POST', '/internal/runs', runPayload(['factoryId' => (string) $this->factory->id]))
        ->assertCreated();

    expect($this->factory->fresh()->unlocked_level)->toBe(2);
});

it('caps unlocked_level at the highest active level', function () {
    $this->factory->update(['level_id' => Level::where('key', 'level-02-too-much-powder')->sole()->id]);

    signedCall('POST', '/internal/runs', runPayload([
        'factoryId' => (string) $this->factory->id,
        'levelKey' => 'level-02-too-much-powder',
    ]))->assertCreated();

    expect($this->factory->fresh()->unlocked_level)->toBe(2);
});

it('skips players whose userId is not a user', function () {
    $sam = User::factory()->create();

    signedCall('POST', '/internal/runs', runPayload([
        'factoryId' => (string) $this->factory->id,
        'players' => [['userId' => (string) $sam->id], ['userId' => '999999']],
    ]))->assertCreated();

    expect(Run::sole()->players->pluck('id')->all())->toBe([$sam->id]);
});

it('keeps the first of two entries for the same player', function () {
    $sam = User::factory()->create();

    signedCall('POST', '/internal/runs', runPayload([
        'factoryId' => (string) $this->factory->id,
        'players' => [
            ['userId' => (string) $sam->id, 'name' => 'First'],
            ['userId' => (string) $sam->id, 'name' => 'Second'],
        ],
    ]))->assertCreated();

    $stats = json_decode(Run::sole()->players->sole()->pivot->stats, true, 512, JSON_THROW_ON_ERROR);

    expect($stats['name'])->toBe('First');
});

it('returns 200 and the same run when the same run is posted twice', function () {
    $payload = runPayload(['factoryId' => (string) $this->factory->id]);

    $first = signedCall('POST', '/internal/runs', $payload)->assertCreated();
    $second = signedCall('POST', '/internal/runs', $payload)->assertOk();

    expect($second->json('runId'))->toBe($first->json('runId'))
        ->and(Run::count())->toBe(1)
        ->and($this->factory->fresh()->day)->toBe(2);
});

it('rejects an unknown level key', function () {
    signedCall('POST', '/internal/runs', runPayload([
        'factoryId' => (string) $this->factory->id,
        'levelKey' => 'level-99-nope',
    ]))->assertStatus(422)->assertJsonValidationErrors('levelKey');
});

it('rejects an unknown factory id', function () {
    signedCall('POST', '/internal/runs', runPayload(['factoryId' => '999999']))
        ->assertStatus(422)
        ->assertJsonValidationErrors('factoryId');
});

it('rejects a non-integer coin', function () {
    signedCall('POST', '/internal/runs', runPayload([
        'factoryId' => (string) $this->factory->id,
        'pnl' => ['coin' => 19.5],
    ]))->assertStatus(422)->assertJsonValidationErrors('pnl.coin');
});

it('rejects an end that precedes the start', function () {
    signedCall('POST', '/internal/runs', runPayload([
        'factoryId' => (string) $this->factory->id,
        'endedAt' => '2026-09-04T20:14:00.000Z',
    ]))->assertStatus(422)->assertJsonValidationErrors('endedAt');
});

it('rejects an unsigned request', function () {
    $this->postJson('/internal/runs', runPayload(['factoryId' => (string) $this->factory->id]))
        ->assertUnauthorized()
        ->assertExactJson(['error' => 'invalid_signature']);

    expect(Run::count())->toBe(0)
        ->and($this->factory->fresh())->day->toBe(1)->coin->toBe(5);
});

it('rejects a wrongly signed request', function () {
    $this->withHeader('X-Dynamite-Signature', str_repeat('a', 64))
        ->postJson('/internal/runs', runPayload(['factoryId' => (string) $this->factory->id]))
        ->assertUnauthorized();

    expect(Run::count())->toBe(0);
});

it('does not lower unlocked_level when the top levels are deactivated', function () {
    Level::factory()->inactive()->create(['key' => 'level-03-the-bottleneck', 'sort' => 3]);
    Level::factory()->inactive()->create(['key' => 'level-04-too-many-helpers', 'sort' => 4]);
    $this->factory->update(['unlocked_level' => 4]);

    signedCall('POST', '/internal/runs', runPayload(['factoryId' => (string) $this->factory->id]))
        ->assertCreated();

    expect($this->factory->fresh()->unlocked_level)->toBe(4);
});

it('leaves unlocked_level alone when no level is active', function () {
    Level::query()->update(['is_active' => false]);
    $this->factory->update(['unlocked_level' => 3]);

    signedCall('POST', '/internal/runs', runPayload(['factoryId' => (string) $this->factory->id]))
        ->assertCreated();

    expect($this->factory->fresh())
        ->unlocked_level->toBe(3)
        ->day->toBe(2);
});

it('rejects a player whose userId is not a scalar', function (mixed $userId) {
    User::factory()->create();

    signedCall('POST', '/internal/runs', runPayload([
        'factoryId' => (string) $this->factory->id,
        'players' => [['userId' => $userId]],
    ]))->assertStatus(422)->assertJsonValidationErrors('players.0.userId');

    expect(Run::count())->toBe(0);
})->with([
    'a list' => [['a']],
    'an object' => [['id' => 1]],
    'a boolean' => true,
    'a float' => 3.9,
    'nothing at all' => null,
]);

it('keys a run on the second, so a retry whose milliseconds drift is the same run', function () {
    $first = signedCall('POST', '/internal/runs', runPayload([
        'factoryId' => (string) $this->factory->id,
        'startedAt' => '2026-09-04T20:15:00.000Z',
    ]))->assertCreated();

    $second = signedCall('POST', '/internal/runs', runPayload([
        'factoryId' => (string) $this->factory->id,
        'startedAt' => '2026-09-04T20:15:00.500Z',
    ]))->assertOk();

    expect($second->json('runId'))->toBe($first->json('runId'))
        ->and(Run::count())->toBe(1)
        ->and($this->factory->fresh()->day)->toBe(2);
});

it('stores a run from a dev join and skips its pseudo player id', function () {
    $sam = User::factory()->create();

    signedCall('POST', '/internal/runs', runPayload([
        'factoryId' => (string) $this->factory->id,
        'players' => [['userId' => (string) $sam->id], ['userId' => 'dev-priya']],
    ]))->assertCreated();

    expect(Run::sole()->players->pluck('id')->all())->toBe([$sam->id]);
});

it('never coerces a userId that is not a whole number onto an account', function (string $userId) {
    User::factory()->count(4)->create();

    signedCall('POST', '/internal/runs', runPayload([
        'factoryId' => (string) $this->factory->id,
        'players' => [['userId' => $userId], ['userId' => $userId]],
    ]))->assertCreated();

    expect(Run::sole()->players)->toBeEmpty();
})->with([
    'a fraction' => '3.9',
    'a word' => 'abc',
    'a dev id' => 'dev-sam',
]);
