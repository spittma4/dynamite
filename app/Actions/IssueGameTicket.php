<?php

declare(strict_types=1);

namespace App\Actions;

use App\Models\Factory;
use App\Models\User;
use RuntimeException;

class IssueGameTicket
{
    /**
     * Long enough to survive a slow page load, short enough that a leaked
     * ticket is worthless by the time anyone finds it.
     */
    private const TTL_SECONDS = 60;

    /**
     * The game server rejects a name outside 1-32 characters, so truncate here
     * rather than hand out a ticket that cannot be redeemed.
     */
    private const NAME_LENGTH = 32;

    public function handle(User $user, Factory $factory): string
    {
        $secret = (string) config('game.secret');

        if ($secret === '') {
            throw new RuntimeException('GAME_SERVER_SECRET is not set');
        }

        $claims = json_encode([
            'userId' => $user->id,
            'factoryId' => $factory->id,
            'name' => mb_substr(trim($user->name), 0, self::NAME_LENGTH),
            'exp' => now()->addSeconds(self::TTL_SECONDS)->timestamp,
        ], JSON_THROW_ON_ERROR);

        $encoded = rtrim(strtr(base64_encode($claims), '+/', '-_'), '=');

        return $encoded.'.'.hash_hmac('sha256', $encoded, $secret);
    }
}
