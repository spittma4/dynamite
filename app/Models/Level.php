<?php

declare(strict_types=1);

namespace App\Models;

use App\Casts\JsonObject;
use Database\Factories\LevelFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;
use stdClass;

/**
 * @property int $id
 * @property string $key
 * @property string $name
 * @property int $sort
 * @property stdClass $config
 * @property stdClass $layout
 * @property bool $is_active
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Level extends Model
{
    /** @use HasFactory<LevelFactory> */
    use HasFactory;

    protected $guarded = [];

    /** @return HasMany<Run, $this> */
    public function runs(): HasMany
    {
        return $this->hasMany(Run::class);
    }

    /** @param  Builder<Level>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /**
     * Sandbox has no shift and no order book, so it is always available: there
     * is nothing to grade and therefore nothing to earn it with.
     */
    public function isSandbox(): bool
    {
        return ($this->config->day->endsOn ?? null) === 'never';
    }

    public function isUnlockedFor(Factory $factory): bool
    {
        return $this->isSandbox() || $this->sort <= $factory->unlocked_level;
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'config' => JsonObject::class,
            'layout' => JsonObject::class,
            'is_active' => 'boolean',
        ];
    }
}
