<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('factory_upgrades', function (Blueprint $table): void {
            $table->foreignId('factory_id')->constrained('factories')->cascadeOnDelete();
            $table->string('upgrade_key');
            $table->timestampTz('purchased_at');
            $table->integer('day');
            $table->primary(['factory_id', 'upgrade_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('factory_upgrades');
    }
};
