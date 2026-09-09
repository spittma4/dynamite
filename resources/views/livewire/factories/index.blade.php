<section class="w-full">
    <div class="mb-6 flex items-end justify-between gap-4">
        <div>
            <flux:heading size="xl" level="1">{{ __('Factories') }}</flux:heading>
            <flux:subheading>{{ __('Every shop you have a bench in.') }}</flux:subheading>
        </div>

        <div class="flex gap-2">
            <flux:button :href="route('factories.join')" wire:navigate>{{ __('Join with a code') }}</flux:button>
            <flux:button variant="primary" :href="route('factories.create')" wire:navigate>{{ __('New factory') }}</flux:button>
        </div>
    </div>

    @if ($this->factories->isEmpty())
        <flux:callout icon="building-office-2">
            <flux:callout.heading>{{ __('No factories yet') }}</flux:callout.heading>
            <flux:callout.text>{{ __('Create one, or join a friend\'s with their six character code.') }}</flux:callout.text>
        </flux:callout>
    @else
        <flux:table>
            <flux:table.columns>
                <flux:table.column>{{ __('Factory') }}</flux:table.column>
                <flux:table.column>{{ __('Day') }}</flux:table.column>
                <flux:table.column>{{ __('Coin') }}</flux:table.column>
                <flux:table.column>{{ __('Join code') }}</flux:table.column>
            </flux:table.columns>

            <flux:table.rows>
                @foreach ($this->factories as $factory)
                    <flux:table.row :key="$factory->id">
                        <flux:table.cell>
                            <flux:link :href="route('factories.show', $factory)" wire:navigate>{{ $factory->name }}</flux:link>
                        </flux:table.cell>
                        <flux:table.cell>{{ $factory->day }}</flux:table.cell>
                        <flux:table.cell>{{ $factory->coin }}</flux:table.cell>
                        <flux:table.cell class="font-mono">{{ $factory->join_code }}</flux:table.cell>
                    </flux:table.row>
                @endforeach
            </flux:table.rows>
        </flux:table>
    @endif
</section>
