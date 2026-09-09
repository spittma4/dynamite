<?php

declare(strict_types=1);

use App\Enums\FactoryRole;
use App\Models\Factory;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

it('seeds the two playtest accounts and their shared factory', function () {
    $this->seed();

    $sam = User::where('email', 'sam@example.com')->sole();
    $priya = User::where('email', 'priya@example.com')->sole();

    expect($sam->is_admin)->toBeTrue()
        ->and($priya->is_admin)->toBeFalse()
        ->and(Hash::check('password', $sam->password))->toBeTrue()
        ->and(Hash::check('password', $priya->password))->toBeTrue();

    $factory = Factory::where('join_code', 'BANG42')->sole();

    expect($factory->name)->toBe('Kaboom & Sons')
        ->and($factory->owner_id)->toBe($sam->id)
        ->and($factory->level_id)->toBeNull()
        ->and($factory->unlocked_level)->toBe(4)
        ->and($factory->members->pluck('id')->all())->toEqualCanonicalizing([$sam->id, $priya->id]);

    expect($factory->members->firstWhere('id', $sam->id)->pivot->role)->toBe(FactoryRole::Owner->value)
        ->and($factory->members->firstWhere('id', $priya->id)->pivot->role)->toBe(FactoryRole::Member->value);
});

it('does not duplicate rows when seeded twice', function () {
    $this->seed();
    $this->seed();

    expect(User::count())->toBe(2)
        ->and(Factory::count())->toBe(1)
        ->and(Factory::where('join_code', 'BANG42')->sole()->members)->toHaveCount(2);
});
