<?php

declare(strict_types=1);

namespace App\Actions;

use App\Exceptions\InvalidLevelFile;
use App\Game\LevelSchemaValidator;
use App\Models\Level;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use JsonException;
use stdClass;

class SyncLevelsFromDisk
{
    public function __construct(private readonly LevelSchemaValidator $validator) {}

    /**
     * Read every level file, then write. A bad file aborts the whole sync, so
     * a typo in level 4 can never leave the campaign half-updated.
     *
     * @return array{created: list<string>, updated: list<string>}
     *
     * @throws InvalidLevelFile
     */
    public function handle(): array
    {
        $parsed = $this->readAll();

        return DB::transaction(function () use ($parsed): array {
            $result = ['created' => [], 'updated' => []];

            foreach ($parsed as $index => $level) {
                $existing = Level::where('key', $level['key'])->first();

                Level::updateOrCreate(['key' => $level['key']], [
                    'name' => $level['config']->name,
                    'sort' => $index + 1,
                    'config' => $level['config'],
                    'layout' => $level['layout'],
                ]);

                $result[$existing === null ? 'created' : 'updated'][] = $level['key'];
            }

            return $result;
        });
    }

    /**
     * Which stored levels a running game would build rooms from that the files no
     * longer agree with. Reads only: the table is allowed to diverge, because admin
     * edits land there, so this answers the question and repairs nothing.
     *
     * @return list<string>
     *
     * @throws InvalidLevelFile
     */
    public function drift(): array
    {
        $stale = [];

        foreach ($this->readAll() as $level) {
            $stored = Level::where('key', $level['key'])->first();

            if ($stored === null) {
                $stale[] = $level['key'];

                continue;
            }

            $same = $this->canonical($stored->config) === $this->canonical($level['config'])
                && $this->canonical($stored->layout) === $this->canonical($level['layout'])
                && $stored->name === $level['config']->name;

            if (! $same) {
                $stale[] = $level['key'];
            }
        }

        return $stale;
    }

    /**
     * Postgres stores these as `jsonb`, which reorders object keys, so the stored
     * copy and the file are never byte-identical even when nothing has changed.
     * Sorting keys all the way down is what makes the comparison about content.
     */
    private function canonical(mixed $value): string
    {
        return (string) json_encode($this->sortKeys($value));
    }

    private function sortKeys(mixed $value): mixed
    {
        if ($value instanceof stdClass) {
            $value = (array) $value;
            ksort($value);

            return array_map($this->sortKeys(...), $value);
        }

        if (is_array($value)) {
            return array_map($this->sortKeys(...), $value);
        }

        return $value;
    }

    /**
     * @return list<array{key: string, config: stdClass, layout: stdClass}>
     */
    private function readAll(): array
    {
        $directory = (string) config('game.levels_path');

        if (! File::isDirectory($directory)) {
            return [];
        }

        $files = File::glob($directory.'/*.json');
        sort($files);

        return array_map($this->readLevel(...), $files);
    }

    /**
     * @return array{key: string, config: stdClass, layout: stdClass}
     */
    private function readLevel(string $path): array
    {
        $stem = pathinfo($path, PATHINFO_FILENAME);
        $config = $this->decode($path);

        foreach (['key', 'name', 'layout'] as $required) {
            if (! isset($config->{$required}) || ! is_string($config->{$required})) {
                throw InvalidLevelFile::because($path, "\"{$required}\" must be a string.");
            }
        }

        if ($config->key !== $stem) {
            throw InvalidLevelFile::because($path, "key \"{$config->key}\" must match the file name \"{$stem}\".");
        }

        $errors = $this->validator->errors($config);

        if ($errors !== []) {
            throw new InvalidLevelFile($path, $errors);
        }

        return ['key' => $config->key, 'config' => $config, 'layout' => $this->readLayout($path, $config->layout)];
    }

    private function readLayout(string $levelPath, string $key): stdClass
    {
        $path = config('game.layouts_path').'/'.$key.'.json';

        if (! File::isFile($path)) {
            throw InvalidLevelFile::because($levelPath, "layout \"{$key}\" is not on disk at {$path}.");
        }

        $layout = $this->decode($path);

        if (($layout->key ?? null) !== $key) {
            throw InvalidLevelFile::because($path, "key must be \"{$key}\".");
        }

        return $layout;
    }

    private function decode(string $path): stdClass
    {
        try {
            $decoded = json_decode((string) File::get($path), false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw InvalidLevelFile::because($path, $e->getMessage());
        }

        if (! $decoded instanceof stdClass) {
            throw InvalidLevelFile::because($path, 'the file must contain a JSON object.');
        }

        return $decoded;
    }
}
