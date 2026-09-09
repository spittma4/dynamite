<?php

declare(strict_types=1);

namespace App\Enums;

enum RunStatus: string
{
    case Ended = 'ended';
    case Exploded = 'exploded';
    case Abandoned = 'abandoned';
}
