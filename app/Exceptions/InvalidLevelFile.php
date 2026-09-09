<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

class InvalidLevelFile extends RuntimeException
{
    /**
     * @param  array<string, list<string>>  $errors  keyed by JSON pointer
     */
    public function __construct(
        public readonly string $path,
        public readonly array $errors,
    ) {
        parent::__construct("[{$path}] is not a valid level file.");
    }

    public static function because(string $path, string $message): self
    {
        return new self($path, ['/' => [$message]]);
    }

    /**
     * @return list<string>
     */
    public function lines(): array
    {
        $lines = [];

        foreach ($this->errors as $pointer => $messages) {
            foreach ($messages as $message) {
                $lines[] = "{$this->path}: {$pointer}: {$message}";
            }
        }

        return $lines;
    }
}
