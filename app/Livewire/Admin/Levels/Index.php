<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Levels;

use App\Models\Level;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\View\View;
use Livewire\Attributes\Computed;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Title('Levels')]
class Index extends Component
{
    public function mount(): void
    {
        $this->authorize('admin');
    }

    public function toggleActive(int $id): void
    {
        $this->authorize('admin');

        $level = Level::findOrFail($id);
        $level->update(['is_active' => ! $level->is_active]);

        unset($this->levels);
    }

    /** @return Collection<int, Level> */
    #[Computed]
    public function levels(): Collection
    {
        return Level::orderBy('sort')->get();
    }

    public function render(): View
    {
        return view('livewire.admin.levels.index');
    }
}
