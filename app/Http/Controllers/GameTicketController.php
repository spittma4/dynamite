<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Actions\IssueGameTicket;
use App\Models\Factory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class GameTicketController extends Controller
{
    public function __invoke(Request $request, IssueGameTicket $issueGameTicket): JsonResponse
    {
        $validated = $request->validate([
            'factory_id' => ['required', 'integer', 'exists:factories,id'],
        ]);

        $factory = Factory::whereKey($validated['factory_id'])->firstOrFail();

        Gate::authorize('view', $factory);

        return response()->json([
            'ticket' => $issueGameTicket->handle($request->user(), $factory),
            'ws_url' => config('game.ws_url'),
            'room' => 'factory',
        ]);
    }
}
