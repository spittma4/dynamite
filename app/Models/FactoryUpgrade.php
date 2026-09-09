<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $factory_id
 * @property string $upgrade_key
 * @property Carbon $purchased_at
 * @property int $day
 */
class FactoryUpgrade extends Model
{
    public $incrementing = false;

    public $timestamps = false;

    protected $guarded = [];

    /** @return BelongsTo<Factory, $this> */
    public function factory(): BelongsTo
    {
        return $this->belongsTo(Factory::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'purchased_at' => 'datetime',
        ];
    }
}
