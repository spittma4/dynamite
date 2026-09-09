<?php

declare(strict_types=1);

use App\Casts\JsonObject;
use App\Models\Level;

beforeEach(function (): void {
    $this->cast = new JsonObject;
    $this->model = new Level;
});

it('decodes a stored document into a stdClass', function () {
    $value = $this->cast->get($this->model, 'config', '{"key":"level-01","day":{"endsOn":"either"}}', []);

    expect($value)->toBeInstanceOf(stdClass::class)
        ->and($value->key)->toBe('level-01')
        ->and($value->day)->toBeInstanceOf(stdClass::class)
        ->and($value->day->endsOn)->toBe('either');
});

it('returns null for a null column', function () {
    expect($this->cast->get($this->model, 'config', null, []))->toBeNull();
});

it('keeps an empty object an object rather than an array', function () {
    $stored = $this->cast->set($this->model, 'config', json_decode('{"inputs":{}}'), []);

    expect($stored)->toBe('{"inputs":{}}')
        ->and($this->cast->get($this->model, 'config', $stored, [])->inputs)->toBeInstanceOf(stdClass::class);
});

it('keeps a whole-number float a float', function () {
    $stored = $this->cast->set($this->model, 'config', json_decode('{"slowdown":6.0}'), []);

    expect($stored)->toBe('{"slowdown":6.0}');
});

it('accepts an already encoded document', function () {
    expect($this->cast->set($this->model, 'config', '{"key":"level-01"}', []))->toBe('{"key":"level-01"}');
});

it('rejects a value that is not a JSON document', function () {
    $this->cast->set($this->model, 'config', ['key' => 'level-01'], []);
})->throws(InvalidArgumentException::class);
