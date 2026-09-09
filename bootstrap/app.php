<?php

use App\Http\Middleware\EnsureGameServerSignature;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function (): void {
            Route::middleware([EnsureGameServerSignature::class, SubstituteBindings::class])
                ->prefix('internal')
                ->name('internal.')
                ->group(base_path('routes/internal.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->is('internal/*') || $request->expectsJson(),
        );

        // The game server reads a code, not prose, so an unknown factory and an
        // unmatched internal route both answer with the contract's error key.
        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            if ($request->is('internal/*')) {
                return response()->json(['error' => 'not_found'], 404);
            }
        });
    })->create();
