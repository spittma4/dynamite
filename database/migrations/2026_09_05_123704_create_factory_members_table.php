<?php

declare(strict_types=1);

use App\Enums\FactoryRole;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('factory_members', function (Blueprint $table): void {
            $table->foreignId('factory_id')->constrained('factories')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->enum('role', array_column(FactoryRole::cases(), 'value'));
            $table->primary(['factory_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('factory_members');
    }
};
