<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Factory;
use App\Models\User;

class FactoryPolicy
{
    /**
     * Membership is the whole of the factory's authorization model: everyone
     * inside a factory can see it and play in it, and nobody else can.
     */
    public function view(User $user, Factory $factory): bool
    {
        return $factory->isMember($user);
    }
}
