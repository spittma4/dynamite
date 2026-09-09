<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Game\InternalSignature;
use Closure;
use Illuminate\Http\Request;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

class EnsureGameServerSignature
{
    /**
     * The game server signs METHOD + path + raw body with the shared secret.
     * The query string is deliberately outside the canonical string, so both
     * sides can sign a URL without agreeing on parameter order.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $secret = (string) config('game.secret');

        if ($secret === '') {
            throw new RuntimeException('GAME_SERVER_SECRET is not set');
        }

        $expected = InternalSignature::sign(
            $request->method(),
            $request->getPathInfo(),
            $request->getContent(),
            $secret,
        );

        $presented = mb_strtolower((string) $request->header('X-Dynamite-Signature'));

        if (! hash_equals($expected, $presented)) {
            return response()->json(['error' => 'invalid_signature'], Response::HTTP_UNAUTHORIZED);
        }

        return $next($request);
    }
}
