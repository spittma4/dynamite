<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('run_players', function (Blueprint $table): void {
            $table->foreignId('run_id')->constrained('runs')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->jsonb('stats');
            $table->primary(['run_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('run_players');
    }
};
