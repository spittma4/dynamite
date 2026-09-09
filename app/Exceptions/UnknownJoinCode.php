<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

class UnknownJoinCode extends RuntimeException
{
    public function __construct(public readonly string $joinCode)
    {
        parent::__construct("No factory has the join code [{$joinCode}].");
    }
}
