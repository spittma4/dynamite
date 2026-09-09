<?php

declare(strict_types=1);

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;
use stdClass;

/**
 * A jsonb column that keeps its shape. Level configs contain empty objects
 * ("inputs": {}) that PHP's associative decoding would turn into arrays, and
 * the game server reads the document back as JSON.
 *
 * @implements CastsAttributes<stdClass, mixed>
 */
class JsonObject implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?stdClass
    {
        if ($value === null) {
            return null;
        }

        return json_decode((string) $value, false, 512, JSON_THROW_ON_ERROR);
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_string($value)) {
            json_decode($value, false, 512, JSON_THROW_ON_ERROR);

            return $value;
        }

        if (! $value instanceof stdClass) {
            throw new InvalidArgumentException("The [{$key}] attribute must be a JSON object, not an array.");
        }

        return json_encode($value, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_SLASHES);
    }
}
