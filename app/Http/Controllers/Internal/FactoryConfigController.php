<?php

declare(strict_types=1);

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use App\Models\Factory;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class FactoryConfigController extends Controller
{
    /**
     * Everything the game server needs to build a room. The level config goes
     * out exactly as it was authored: validating it, applying the defaults and
     * scaling it for the seat count are all the game server's job.
     */
    public function __invoke(Request $request, Factory $factory): JsonResponse
    {
        $request->validate([
            'players' => ['sometimes', 'integer', 'between:1,10'],
        ]);

        $level = $factory->effectiveLevel();

        if ($level === null) {
            return response()->json(['error' => 'no_active_level'], Response::HTTP_NOT_FOUND);
        }

        return response()->json([
            'factory' => [
                'id' => $factory->id,
                'name' => $factory->name,
                'day' => $factory->day,
                'coin' => $factory->coin,
                'ownerUserId' => $factory->owner_id,
            ],
            'level' => $level->config,
            'layout' => $level->layout,
            'members' => $factory->members()
                ->orderBy('name')
                ->get()
                ->map(fn (User $member): array => ['userId' => $member->id, 'name' => $member->name])
                ->all(),
        ]);
    }
}
