<?php

declare(strict_types=1);

use App\Http\Controllers\Internal\FactoryConfigController;
use App\Http\Controllers\Internal\StoreRunController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Internal routes
|--------------------------------------------------------------------------
|
| The game server's half of the seam. Every request is HMAC-signed with the
| shared secret; there is no session, no CSRF and no user here.
|
*/

Route::get('factories/{factory}/config', FactoryConfigController::class)->name('factories.config');
Route::post('runs', StoreRunController::class)->name('runs.store');
