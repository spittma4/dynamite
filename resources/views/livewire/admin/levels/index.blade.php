<section class="w-full">
    <flux:heading size="xl" level="1">{{ __('Levels') }}</flux:heading>
    <flux:subheading class="mb-6">{{ __('Synced from config/game/levels. Toggling one off hides it from every factory.') }}</flux:subheading>

    <flux:table>
        <flux:table.columns>
            <flux:table.column>{{ __('Key') }}</flux:table.column>
            <flux:table.column>{{ __('Name') }}</flux:table.column>
            <flux:table.column>{{ __('Sort') }}</flux:table.column>
            <flux:table.column>{{ __('Active') }}</flux:table.column>
            <flux:table.column />
        </flux:table.columns>

        <flux:table.rows>
            @foreach ($this->levels as $level)
                <flux:table.row wire:key="level-{{ $level->id }}">
                    <flux:table.cell class="font-mono">{{ $level->key }}</flux:table.cell>
                    <flux:table.cell>{{ $level->name }}</flux:table.cell>
                    <flux:table.cell>{{ $level->sort }}</flux:table.cell>
                    <flux:table.cell>
                        <flux:switch
                            :checked="$level->is_active"
                            wire:click="toggleActive({{ $level->id }})"
                            :aria-label="__('Active')"
                        />
                    </flux:table.cell>
                    <flux:table.cell>
                        <flux:link :href="route('admin.levels.edit', $level)" wire:navigate>{{ __('Edit') }}</flux:link>
                    </flux:table.cell>
                </flux:table.row>
            @endforeach
        </flux:table.rows>
    </flux:table>
</section>
