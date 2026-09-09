<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\RunStatus;
use App\Models\Factory;
use App\Models\Level;
use App\Models\Run;
use Illuminate\Database\Eloquent\Factories\Factory as EloquentFactory;

/**
 * @extends EloquentFactory<Run>
 */
class RunFactory extends EloquentFactory
{
    protected $model = Run::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $metrics = json_decode(
            (string) file_get_contents(base_path('tests/Fixtures/game/run.json')),
            true,
            512,
            JSON_THROW_ON_ERROR
        );

        return [
            'factory_id' => Factory::factory(),
            'level_id' => Level::factory(),
            'day' => 1,
            'seed' => fake()->unique()->numberBetween(1, 2_000_000_000),
            'started_at' => now()->subMinutes(8),
            'ended_at' => now(),
            'status' => RunStatus::Ended,
            'grade' => 'C',
            'profit' => 192,
            'coin_earned' => 19,
            'metrics' => $metrics,
        ];
    }

    public function grade(string $grade): static
    {
        return $this->state(fn (array $attributes): array => ['grade' => $grade]);
    }

    public function status(RunStatus $status): static
    {
        return $this->state(fn (array $attributes): array => ['status' => $status]);
    }
}
