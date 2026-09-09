<?php

declare(strict_types=1);

use App\Enums\FactoryRole;
use App\Models\Factory;
use App\Models\User;

test('the owner may view the factory', function () {
    $factory = Factory::factory()->create();

    expect($factory->owner->can('view', $factory))->toBeTrue();
});

test('a member may view the factory', function () {
    $factory = Factory::factory()->create();
    $member = User::factory()->create();
    $factory->addMember($member, FactoryRole::Member);

    expect($member->can('view', $factory))->toBeTrue();
});

test('a stranger may not view the factory', function () {
    $factory = Factory::factory()->create();

    expect(User::factory()->create()->can('view', $factory))->toBeFalse();
});

test('the admin gate follows the is_admin column', function () {
    expect(User::factory()->create(['is_admin' => true])->can('admin'))->toBeTrue()
        ->and(User::factory()->create()->can('admin'))->toBeFalse();
});
