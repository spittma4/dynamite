<?php

declare(strict_types=1);

namespace App\Livewire\Factories;

use App\Models\Factory;
use App\Models\Level;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\View\View;
use Livewire\Attributes\Computed;
use Livewire\Component;

class Show extends Component
{
    /**
     * How much of the shop's history is worth scrolling on the factory screen.
     */
    private const RUN_HISTORY = 20;

    public Factory $factory;

    public ?int $levelId = null;

    public function mount(Factory $factory): void
    {
        $this->authorize('view', $factory);

        $this->factory = $factory;
        $this->levelId = $factory->effectiveLevel()?->id;
    }

    /**
     * Any member may set the level, but only to one the factory has earned.
     */
    public function updatedLevelId(mixed $value): void
    {
        // A Livewire update posts to its own endpoint, and never re-runs the route's
        // "can:view" middleware, so membership would otherwise be a check we made
        // only once, at page load, and not on any of the writes that follow it.
        $this->authorize('view', $this->factory);

        $level = Level::query()->active()->whereKey((int) $value)->first();

        if ($level === null || ! $level->isUnlockedFor($this->factory)) {
            $this->addError('levelId', __('That level is locked.'));
            $this->levelId = $this->factory->effectiveLevel()?->id;

            return;
        }

        $this->resetErrorBag('levelId');
        $this->factory->update(['level_id' => $level->id]);
    }

    /** @return Collection<int, Level> */
    #[Computed]
    public function levels(): Collection
    {
        return Level::query()->active()->orderBy('sort')->get();
    }

    public function render(): View
    {
        return view('livewire.factories.show', [
            'members' => $this->factory->members()
                ->orderByRaw("case when role = 'owner' then 0 else 1 end")
                ->orderBy('name')
                ->get(),
            'runs' => $this->factory->runs()
                ->with('level')
                ->latest('ended_at')
                ->limit(self::RUN_HISTORY)
                ->get(),
            'playableLevel' => $this->factory->effectiveLevel(),
        ])->title($this->factory->name);
    }
}
