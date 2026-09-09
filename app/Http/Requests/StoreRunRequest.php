<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\RunStatus;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreRunRequest extends FormRequest
{
    /**
     * The game server sends the whole report card; Laravel reads the handful of
     * fields it stores in columns and keeps the rest verbatim as metrics.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'factoryId' => ['required', 'integer', 'exists:factories,id'],
            'levelKey' => ['required', 'string', 'exists:levels,key'],
            'day' => ['required', 'integer', 'min:1'],
            'seed' => ['required', 'integer'],
            'startedAt' => ['required', 'date'],
            'endedAt' => ['required', 'date', 'after_or_equal:startedAt'],
            'status' => ['required', Rule::enum(RunStatus::class)],
            'grade' => ['required', 'in:A,B,C,D,F'],
            'score' => ['required', 'numeric'],
            'pnl.profit' => ['required', 'integer'],
            'pnl.coin' => ['required', 'integer', 'min:0'],
            'players' => ['present', 'array'],
            'players.*.userId' => ['required', $this->scalarUserId(...)],
            'players.*.name' => ['required', 'string'],
            'players.*.utilization' => ['required', 'numeric'],
            'players.*.label' => ['required', 'string'],
        ];
    }

    /**
     * A user id arrives as the JSON string of an account id or, from a dev join,
     * as a "dev-<name>" pseudo id that StoreRun skips. Anything that is not a
     * scalar would be cast onto an account it has nothing to do with.
     */
    private function scalarUserId(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_int($value) && ! is_string($value)) {
            $fail('The :attribute field must be a user id.');
        }
    }
}
