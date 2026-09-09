<?php

declare(strict_types=1);

namespace App\Livewire\Factories;

use App\Actions\JoinFactoryByCode;
use App\Exceptions\UnknownJoinCode;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Title('Join a factory')]
class Join extends Component
{
    public string $code = '';

    public function join(JoinFactoryByCode $joinFactoryByCode): void
    {
        $validated = $this->validate([
            'code' => ['required', 'string'],
        ]);

        try {
            $factory = $joinFactoryByCode->handle(Auth::user(), $validated['code']);
        } catch (UnknownJoinCode) {
            $this->addError('code', __('No factory has that code.'));

            return;
        }

        $this->redirectRoute('factories.show', $factory, navigate: true);
    }

    public function render(): View
    {
        return view('livewire.factories.join');
    }
}
