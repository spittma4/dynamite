<?php

declare(strict_types=1);

namespace App\Game;

class InternalSignature
{
    /**
     * The one place the canonical string is built. The game server signs the
     * same three parts in the same order, so any change here has to land in
     * game-server/src/laravel/signature.ts too.
     */
    public static function sign(string $method, string $path, string $body, string $secret): string
    {
        return hash_hmac('sha256', mb_strtoupper($method).$path.$body, $secret);
    }
}
