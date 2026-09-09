<?php

declare(strict_types=1);

use App\Http\Controllers\GameTicketController;
use App\Http\Controllers\PlayController;
use App\Livewire\Admin;
use App\Livewire\Factories;
use Illuminate\Support\Facades\Route;

Route::view('/', 'welcome')->name('home');

Route::redirect('dashboard', '/factories')->name('dashboard');

Route::middleware('auth')->group(function (): void {
    Route::livewire('factories', Factories\Index::class)->name('factories.index');
    Route::livewire('factories/create', Factories\Create::class)->name('factories.create');
    Route::livewire('factories/join', Factories\Join::class)->name('factories.join');

    Route::livewire('factories/{factory}', Factories\Show::class)
        ->middleware('can:view,factory')
        ->name('factories.show');

    Route::get('factories/{factory}/play', PlayController::class)
        ->middleware('can:view,factory')
        ->name('factories.play');

    Route::post('game/ticket', GameTicketController::class)->name('game.ticket');
});

Route::middleware(['auth', 'can:admin'])->prefix('admin')->name('admin.')->group(function (): void {
    Route::livewire('levels', Admin\Levels\Index::class)->name('levels.index');
    Route::livewire('levels/{level}/edit', Admin\Levels\Edit::class)->name('levels.edit');
});

require __DIR__.'/settings.php';
