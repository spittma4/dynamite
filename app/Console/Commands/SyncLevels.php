<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\SyncLevelsFromDisk;
use App\Exceptions\InvalidLevelFile;
use Illuminate\Console\Command;

class SyncLevels extends Command
{
    protected $signature = 'game:levels:sync {--check : Report drift between the files and the table, and write nothing}';

    protected $description = 'Validate the level files on disk and upsert them into the levels table';

    public function handle(SyncLevelsFromDisk $sync): int
    {
        try {
            if ($this->option('check')) {
                return $this->report($sync->drift());
            }

            $result = $sync->handle();
        } catch (InvalidLevelFile $e) {
            foreach ($e->lines() as $line) {
                $this->error($line);
            }

            return self::FAILURE;
        }

        foreach ($result['created'] as $key) {
            $this->line("created {$key}");
        }

        foreach ($result['updated'] as $key) {
            $this->line("updated {$key}");
        }

        return self::SUCCESS;
    }

    /**
     * The table is allowed to differ from the files — admin edits land there and
     * syncing is deliberate. So drift is reported, never repaired: this says which
     * levels a running game would build rooms from that the repo no longer agrees
     * with, and leaves the decision to a person.
     *
     * @param  list<string>  $stale
     */
    private function report(array $stale): int
    {
        if ($stale === []) {
            $this->info('The levels table is in step with the files.');

            return self::SUCCESS;
        }

        foreach ($stale as $key) {
            $this->error("{$key}: the stored level differs from its file");
        }

        $this->line('Run `php artisan game:levels:sync` to take the files, or keep the table if the difference is a deliberate admin edit.');

        return self::FAILURE;
    }
}
