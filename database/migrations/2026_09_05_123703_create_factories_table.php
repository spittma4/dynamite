<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('factories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('owner_id')->constrained('users')->restrictOnDelete();
            $table->string('name');
            $table->string('join_code', 6)->unique();
            $table->foreignId('level_id')->nullable()->constrained('levels')->nullOnDelete();
            $table->integer('coin')->default(0);
            $table->integer('day')->default(1);
            $table->integer('unlocked_level')->default(1);
            $table->timestampsTz();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('factories');
    }
};
