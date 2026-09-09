<?php

declare(strict_types=1);

namespace App\Livewire\Factories;

use App\Models\Factory;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;
use Livewire\Attributes\Computed;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Title('Factories')]
class Index extends Component
{
    /** @return Collection<int, Factory> */
    #[Computed]
    public function factories(): Collection
    {
        return Auth::user()->factories()->orderBy('name')->get();
    }

    public function render(): View
    {
        return view('livewire.factories.index');
    }
}
