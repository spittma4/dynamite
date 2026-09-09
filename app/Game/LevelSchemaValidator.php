<?php

declare(strict_types=1);

namespace App\Game;

use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator;
use RuntimeException;
use stdClass;

class LevelSchemaValidator
{
    /**
     * Opis stops at the first error unless told otherwise, and an editor that
     * reveals one mistake per save is an editor nobody finishes a level in.
     */
    private const MAX_ERRORS = 50;

    private readonly stdClass $schema;

    /**
     * Laravel and the game server validate against the same document, so a
     * level that saves in the admin editor is a level the room can start.
     */
    public function __construct()
    {
        $path = (string) config('game.schema_path');

        if (! is_file($path)) {
            throw new RuntimeException("Level schema not found at [{$path}].");
        }

        $this->schema = json_decode((string) file_get_contents($path), false, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @return array<string, list<string>> keyed by JSON pointer; empty when valid
     */
    public function errors(stdClass $config): array
    {
        $result = (new Validator)->setMaxErrors(self::MAX_ERRORS)->validate($config, $this->schema);

        if ($result->isValid()) {
            return [];
        }

        return (new ErrorFormatter)->format($result->error());
    }
}
