<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\RunStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $factory_id
 * @property int $level_id
 * @property int $day
 * @property int $seed
 * @property Carbon $started_at
 * @property Carbon $ended_at
 * @property RunStatus $status
 * @property string $grade
 * @property int $profit
 * @property int $coin_earned
 * @property array<string, mixed> $metrics
 */
class Run extends Model
{
    /**
     * A run belongs to a Factory, so "factory" is taken as a relationship and
     * the HasFactory trait cannot live here. Tests reach the model factory as
     * Database\Factories\RunFactory::new() instead.
     */
    protected $guarded = [];

    /** @return BelongsTo<Factory, $this> */
    public function factory(): BelongsTo
    {
        return $this->belongsTo(Factory::class);
    }

    /** @return BelongsTo<Level, $this> */
    public function level(): BelongsTo
    {
        return $this->belongsTo(Level::class);
    }

    /** @return BelongsToMany<User, $this> */
    public function players(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'run_players')
            ->withPivot('stats');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'ended_at' => 'datetime',
            'status' => RunStatus::class,
            'metrics' => 'array',
        ];
    }
}
