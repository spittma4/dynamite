<?php

declare(strict_types=1);

namespace App\Actions;

use App\Enums\FactoryRole;
use App\Exceptions\UnknownJoinCode;
use App\Models\Factory;
use App\Models\User;
use Illuminate\Support\Str;

class JoinFactoryByCode
{
    /**
     * Join codes get read out loud, so accept whatever the typist heard:
     * "bang 42", "BANG-42" and "BANG42" are the same factory.
     */
    public function handle(User $user, string $code): Factory
    {
        $normalised = Str::of($code)->replaceMatches('/[\s-]+/', '')->upper()->value();

        $factory = Factory::where('join_code', $normalised)->first();

        if ($factory === null) {
            throw new UnknownJoinCode($normalised);
        }

        if (! $factory->isMember($user)) {
            $factory->addMember($user, FactoryRole::Member);
        }

        return $factory;
    }
}
