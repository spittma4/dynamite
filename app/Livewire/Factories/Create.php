<?php

declare(strict_types=1);

namespace App\Livewire\Factories;

use App\Actions\CreateFactory;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Title('New factory')]
class Create extends Component
{
    public string $name = '';

    public function create(CreateFactory $createFactory): void
    {
        $validated = $this->validate([
            'name' => ['required', 'string', 'min:2', 'max:40'],
        ]);

        $factory = $createFactory->handle(Auth::user(), $validated['name']);

        $this->redirectRoute('factories.show', $factory, navigate: true);
    }

    public function render(): View
    {
        return view('livewire.factories.create');
    }
}
