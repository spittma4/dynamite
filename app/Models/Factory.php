<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\FactoryRole;
use Database\Factories\FactoryFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $owner_id
 * @property string $name
 * @property string $join_code
 * @property int|null $level_id
 * @property int $coin
 * @property int $day
 * @property int $unlocked_level
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Factory extends Model
{
    /** @use HasFactory<FactoryFactory> */
    use HasFactory;

    protected $guarded = [];

    /** @return BelongsTo<User, $this> */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /** @return BelongsTo<Level, $this> */
    public function level(): BelongsTo
    {
        return $this->belongsTo(Level::class);
    }

    /** @return BelongsToMany<User, $this> */
    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'factory_members')
            ->withPivot('role');
    }

    /** @return HasMany<Run, $this> */
    public function runs(): HasMany
    {
        return $this->hasMany(Run::class);
    }

    /** @return HasMany<FactoryUpgrade, $this> */
    public function upgrades(): HasMany
    {
        return $this->hasMany(FactoryUpgrade::class);
    }

    public function isMember(User $user): bool
    {
        return $this->members()->whereKey($user->id)->exists();
    }

    /**
     * The level the room will run. A deactivated selection falls back to the
     * start of the campaign so a factory is never stranded on a hidden level.
     */
    public function effectiveLevel(): ?Level
    {
        $selected = $this->level;

        if ($selected !== null && $selected->is_active) {
            return $selected;
        }

        return Level::query()->active()->orderBy('sort')->first();
    }

    public function addMember(User $user, FactoryRole $role): void
    {
        $this->members()->syncWithoutDetaching([$user->id => ['role' => $role->value]]);
    }
}
