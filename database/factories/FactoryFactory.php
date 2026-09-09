<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\FactoryRole;
use App\Models\Factory;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory as EloquentFactory;
use Illuminate\Support\Str;

/**
 * @extends EloquentFactory<Factory>
 */
class FactoryFactory extends EloquentFactory
{
    protected $model = Factory::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'owner_id' => User::factory(),
            'name' => fake()->company(),
            'join_code' => Str::upper(Str::random(6)),
            'level_id' => null,
            'coin' => 0,
            'day' => 1,
            'unlocked_level' => 1,
        ];
    }

    /**
     * Attach the owner as a member, which every real factory has.
     */
    public function configure(): static
    {
        return $this->afterCreating(function (Factory $factory): void {
            $factory->addMember($factory->owner, FactoryRole::Owner);
        });
    }

    public function unlockedTo(int $sort): static
    {
        return $this->state(fn (array $attributes): array => ['unlocked_level' => $sort]);
    }
}
