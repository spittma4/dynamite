<?php

declare(strict_types=1);

use App\Livewire\Factories\Show;
use App\Models\Factory;
use App\Models\Level;
use Livewire\Livewire;

/**
 * Sandbox is the one level a factory never has to earn, so the rule that
 * exempts it is worth pinning from both sides. The rendered select and the
 * play page's debug flag are covered by ShowTest and PlayPageTest.
 */
beforeEach(function (): void {
    $this->factory = Factory::factory()->create(['unlocked_level' => 1]);
    $this->owner = $this->factory->owner;
});

it('reads sandbox off the stored config, not the key', function () {
    $sandbox = Level::factory()->sandbox()->create(['key' => 'tinkering', 'sort' => 9]);
    $impostor = Level::factory()->create(['key' => 'sandbox', 'sort' => 8]);

    expect($sandbox->isSandbox())->toBeTrue()
        ->and($impostor->isSandbox())->toBeFalse();
});

it('unlocks a sandbox above the unlocked level and locks an ordinary one', function () {
    $sandbox = Level::factory()->sandbox()->create(['sort' => 5]);
    $ordinary = Level::factory()->create(['sort' => 5]);

    expect($sandbox->isUnlockedFor($this->factory))->toBeTrue()
        ->and($ordinary->isUnlockedFor($this->factory))->toBeFalse();
});

it('lets a member select the sandbox at unlocked level one', function () {
    Level::factory()->create(['sort' => 1, 'name' => 'Basic Flow']);
    $sandbox = Level::factory()->sandbox()->create(['sort' => 5]);

    Livewire::actingAs($this->owner)
        ->test(Show::class, ['factory' => $this->factory])
        ->set('levelId', $sandbox->id)
        ->assertHasNoErrors();

    expect($this->factory->fresh()->level_id)->toBe($sandbox->id);
});

it('does not offer an inactive sandbox', function () {
    Level::factory()->create(['sort' => 1, 'name' => 'Basic Flow']);
    $sandbox = Level::factory()->sandbox()->inactive()->create(['sort' => 5]);

    Livewire::actingAs($this->owner)
        ->test(Show::class, ['factory' => $this->factory])
        ->assertDontSee('Sandbox')
        ->set('levelId', $sandbox->id)
        ->assertHasErrors('levelId');

    expect($this->factory->fresh()->level_id)->toBeNull();
});

it('never falls back to the sandbox when the chosen level is deactivated', function () {
    $basic = Level::factory()->create(['sort' => 1, 'name' => 'Basic Flow']);
    Level::factory()->sandbox()->create(['sort' => 5]);
    $retired = Level::factory()->inactive()->create(['sort' => 2]);

    $this->factory->update(['level_id' => $retired->id]);

    expect($this->factory->fresh()->effectiveLevel()->id)->toBe($basic->id);
});
