<?php

declare(strict_types=1);

use App\Enums\RunStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('runs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('factory_id')->constrained('factories')->cascadeOnDelete();
            $table->foreignId('level_id')->constrained('levels')->restrictOnDelete();
            $table->integer('day');
            $table->bigInteger('seed');
            $table->timestampTz('started_at');
            $table->timestampTz('ended_at');
            $table->enum('status', array_column(RunStatus::cases(), 'value'));
            $table->char('grade', 1);
            $table->integer('profit');
            $table->integer('coin_earned');
            $table->jsonb('metrics');
            $table->timestampsTz();

            $table->unique(['factory_id', 'seed', 'started_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('runs');
    }
};
