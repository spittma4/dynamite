<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\SyncLevelsFromDisk;
use App\Exceptions\InvalidLevelFile;
use Illuminate\Console\Command;

class SyncLevels extends Command
{
    protected $signature = 'game:levels:sync';

    protected $description = 'Validate the level files on disk and upsert them into the levels table';

    public function handle(SyncLevelsFromDisk $sync): int
    {
        try {
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
}
