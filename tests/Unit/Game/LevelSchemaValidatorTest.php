<?php

declare(strict_types=1);

use App\Game\LevelSchemaValidator;

beforeEach(function (): void {
    config(['game.schema_path' => base_path('tests/Fixtures/game/level.schema.json')]);

    $this->config = fn (): stdClass => json_decode(
        (string) file_get_contents(base_path('tests/Fixtures/game/levels/level-01-basic-flow.json')),
        false,
        512,
        JSON_THROW_ON_ERROR
    );
});

it('finds no errors in a valid level config', function () {
    expect(app(LevelSchemaValidator::class)->errors(($this->config)()))->toBe([]);
});

it('keys each error by its JSON pointer into the config', function () {
    $config = ($this->config)();
    $config->clipboardSeconds = 'three';
    $config->day->endsOn = 'whenever';

    $errors = app(LevelSchemaValidator::class)->errors($config);

    expect($errors)->toHaveKeys(['/clipboardSeconds', '/day/endsOn'])
        ->and($errors['/clipboardSeconds'])->toBeArray()->not->toBeEmpty();
});

it('reports a missing required key', function () {
    $config = ($this->config)();
    unset($config->layout);

    expect(app(LevelSchemaValidator::class)->errors($config))->toHaveKey('/');
});

it('accepts an empty object where the schema wants an object', function () {
    $config = ($this->config)();
    $config->recipes->keg->inputs = new stdClass;

    expect(app(LevelSchemaValidator::class)->errors($config))->toBe([]);
});

it('rejects an empty array where the schema wants an object', function () {
    $config = ($this->config)();
    $config->recipes->keg->inputs = [];

    expect(app(LevelSchemaValidator::class)->errors($config))->toHaveKey('/recipes/keg/inputs');
});

it('fails loudly when the schema file is missing', function () {
    config(['game.schema_path' => base_path('shared/src/config/does-not-exist.json')]);

    app(LevelSchemaValidator::class);
})->throws(RuntimeException::class);

it('validates a level against the schema the application ships', function () {
    // Every other test here points at the permissive fixture schema, and without
    // this one nothing would exercise the draft-07 document we actually ship,
    // and a renamed path or a broken $ref would sail past on a green suite.
    config(['game.schema_path' => (require base_path('config/game.php'))['schema_path']]);

    $level = json_decode(
        (string) file_get_contents(base_path('tests/Fixtures/game/levels/level-01-basic-flow.json')),
        false,
        512,
        JSON_THROW_ON_ERROR
    );

    expect(app(LevelSchemaValidator::class)->errors($level))->toBe([]);
});
