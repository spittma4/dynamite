<?php

declare(strict_types=1);

namespace App\Enums;

enum FactoryRole: string
{
    case Owner = 'owner';
    case Member = 'member';
}
