<?php

declare(strict_types=1);

namespace App\Actions;

use App\Enums\FactoryRole;
use App\Models\Factory;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class CreateFactory
{
    /**
     * No 0/O or 1/I: the code is read aloud and typed by a friend.
     */
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    private const CODE_LENGTH = 6;

    private const CODE_ATTEMPTS = 5;

    public function handle(User $owner, string $name): Factory
    {
        return DB::transaction(function () use ($owner, $name): Factory {
            $factory = Factory::create([
                'owner_id' => $owner->id,
                'name' => $name,
                'join_code' => $this->joinCode(),
                'level_id' => null,
                'coin' => 0,
                'day' => 1,
                'unlocked_level' => 1,
            ]);

            $factory->addMember($owner, FactoryRole::Owner);

            return $factory;
        });
    }

    private function joinCode(): string
    {
        for ($attempt = 0; $attempt < self::CODE_ATTEMPTS; $attempt++) {
            $code = '';

            for ($i = 0; $i < self::CODE_LENGTH; $i++) {
                $code .= self::ALPHABET[random_int(0, mb_strlen(self::ALPHABET) - 1)];
            }

            if (! Factory::where('join_code', $code)->exists()) {
                return $code;
            }
        }

        throw new RuntimeException('Could not generate an unused join code.');
    }
}
