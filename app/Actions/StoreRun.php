<?php

declare(strict_types=1);

namespace App\Actions;

use App\Enums\RunStatus;
use App\Models\Factory;
use App\Models\Level;
use App\Models\Run;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class StoreRun
{
    /**
     * A→F, so a lower rank is a better grade.
     */
    private const GRADES = ['A', 'B', 'C', 'D', 'F'];

    /**
     * Persist a finished day and pay the factory for it.
     *
     * The game server retries a failed post, so the run is keyed on
     * (factory, seed, start) and a repeat returns the run already stored
     * rather than crediting the coin twice.
     *
     * @param  array<string, mixed>  $payload
     */
    public function handle(array $payload): Run
    {
        return DB::transaction(function () use ($payload): Run {
            $factory = Factory::whereKey((int) $payload['factoryId'])->lockForUpdate()->firstOrFail();
            $level = Level::where('key', $payload['levelKey'])->firstOrFail();

            // Eloquent binds this column with a whole-second date format, so we truncate
            // the key to seconds here as well, and a retry whose milliseconds drifted
            // still finds the run we stored rather than silently writing a new one.
            $startedAt = Carbon::parse($payload['startedAt'])->startOfSecond();

            $existing = Run::where('factory_id', $factory->id)
                ->where('seed', $payload['seed'])
                ->where('started_at', $startedAt)
                ->first();

            if ($existing !== null) {
                return $existing;
            }

            $status = RunStatus::from($payload['status']);

            $run = Run::create([
                'factory_id' => $factory->id,
                'level_id' => $level->id,
                'day' => $payload['day'],
                'seed' => $payload['seed'],
                'started_at' => $startedAt,
                'ended_at' => Carbon::parse($payload['endedAt']),
                'status' => $status,
                'grade' => $payload['grade'],
                'profit' => $payload['pnl']['profit'],
                'coin_earned' => $payload['pnl']['coin'],
                'metrics' => $payload,
            ]);

            $this->attachPlayers($run, $payload['players']);
            $this->payFactory($factory, $level, $status, $payload);

            return $run;
        });
    }

    /**
     * @param  list<array<string, mixed>>  $players
     */
    private function attachPlayers(Run $run, array $players): void
    {
        $entries = [];

        foreach ($players as $player) {
            // A dev join sends a "dev-<name>" id that is no account at all, and a rejoin
            // repeats a player, so we take an id only from a whole number and we keep
            // only the first entry we meet for each of the ids we are able to read.
            $userId = filter_var($player['userId'], FILTER_VALIDATE_INT);

            if ($userId === false) {
                continue;
            }

            $entries[$userId] ??= ['stats' => json_encode($player, JSON_THROW_ON_ERROR)];
        }

        $userIds = User::whereIn('id', array_keys($entries))->pluck('id')->all();

        $run->players()->attach(array_intersect_key($entries, array_flip($userIds)));
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function payFactory(Factory $factory, Level $level, RunStatus $status, array $payload): void
    {
        if ($status === RunStatus::Abandoned) {
            return;
        }

        $factory->day += 1;
        $factory->coin += $payload['pnl']['coin'];

        if ($status === RunStatus::Ended && $this->earnsAdvance($level, $payload['grade'])) {
            $cap = (int) Level::query()->active()->max('sort');

            // Here we cap the raise at the ladder we have actually shipped, and we apply
            // the cap to the candidate rather than to the value already stored, since
            // retiring a level must never claw back progress that a factory earned.
            if ($cap > 0) {
                $factory->unlocked_level = max($factory->unlocked_level, min($level->sort + 1, $cap));
            }
        }

        $factory->save();
    }

    private function earnsAdvance(Level $level, string $grade): bool
    {
        $advanceOn = $level->config->grading->advanceOn ?? 'C';

        return array_search($grade, self::GRADES, true) <= array_search($advanceOn, self::GRADES, true);
    }
}
