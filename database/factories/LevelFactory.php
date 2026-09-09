<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Level;
use Illuminate\Database\Eloquent\Factories\Factory;
use stdClass;

/**
 * @extends Factory<Level>
 */
class LevelFactory extends Factory
{
    protected $model = Level::class;

    /**
     * The stored config carries its own key and name, and the game server
     * trusts them, so they always follow the row's.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'key' => 'level-'.fake()->unique()->numberBetween(10, 99).'-'.fake()->slug(2),
            'name' => fake()->words(3, true),
            'sort' => fake()->unique()->numberBetween(1, 50),
            'config' => fn (array $attributes): stdClass => self::configFor($attributes['key'], $attributes['name']),
            'layout' => self::fixture('layouts/one-line.json'),
            'is_active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes): array => ['is_active' => false]);
    }

    /**
     * Sandbox has no shift and no order book, which is what makes it a sandbox.
     */
    public function sandbox(): static
    {
        return $this->state(fn (array $attributes): array => [
            'key' => 'sandbox',
            'name' => 'Sandbox',
            'config' => function (array $attributes): stdClass {
                $config = self::configFor($attributes['key'], $attributes['name']);
                $config->day->shiftSeconds = 0;
                $config->day->orderBook = 0;
                $config->day->endsOn = 'never';
                $config->players->min = 1;

                return $config;
            },
        ]);
    }

    private static function configFor(string $key, string $name): stdClass
    {
        $config = self::fixture('levels/level-01-basic-flow.json');
        $config->key = $key;
        $config->name = $name;

        return $config;
    }

    private static function fixture(string $path): stdClass
    {
        return json_decode(
            (string) file_get_contents(base_path("tests/Fixtures/game/{$path}")),
            false,
            512,
            JSON_THROW_ON_ERROR
        );
    }
}
