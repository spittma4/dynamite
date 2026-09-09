<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Factory;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class PlayController extends Controller
{
    public function __invoke(Request $request, Factory $factory): View|RedirectResponse
    {
        $level = $factory->effectiveLevel();

        if ($level === null) {
            return redirect()
                ->route('factories.show', $factory)
                ->with('error', 'Pick a level first.');
        }

        return view('play', [
            'factory' => $factory,
            'debug' => config('app.debug') || $request->boolean('debug') || $level->isSandbox(),
        ]);
    }
}
