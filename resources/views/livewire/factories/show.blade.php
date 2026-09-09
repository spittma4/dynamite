<section class="flex w-full flex-col gap-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
            <flux:heading size="xl" level="1">{{ $factory->name }}</flux:heading>
            <flux:subheading>{{ __('Day :day · :coin coin', ['day' => $factory->day, 'coin' => $factory->coin]) }}</flux:subheading>
        </div>

        @if ($playableLevel)
            <flux:button variant="primary" icon="play" :href="route('factories.play', $factory)">
                {{ __('Enter factory') }}
            </flux:button>
        @else
            <flux:button variant="primary" icon="play" disabled>{{ __('Sync levels first') }}</flux:button>
        @endif
    </div>

    @if (session('error'))
        <flux:callout variant="danger" icon="exclamation-triangle" :heading="session('error')" />
    @endif

    <div class="grid gap-8 lg:grid-cols-2">
        <div class="flex flex-col gap-4">
            <flux:heading size="lg" level="2">{{ __('Crew') }}</flux:heading>

            <ul class="flex flex-col gap-2">
                @foreach ($members as $member)
                    <li class="flex items-center gap-3" wire:key="member-{{ $member->id }}">
                        <flux:avatar :name="$member->name" size="xs" />
                        <flux:text>{{ $member->name }}</flux:text>
                        <flux:badge size="sm" :color="$member->pivot->role === 'owner' ? 'amber' : 'zinc'">
                            {{ $member->pivot->role }}
                        </flux:badge>
                    </li>
                @endforeach
            </ul>

            <div x-data="{ copied: false }" class="flex items-center gap-3">
                <flux:text>{{ __('Join code') }}</flux:text>
                <code class="rounded bg-zinc-100 px-2 py-1 font-mono text-sm dark:bg-zinc-800">{{ $factory->join_code }}</code>
                <flux:button
                    size="xs"
                    variant="subtle"
                    x-on:click="navigator.clipboard.writeText('{{ $factory->join_code }}'); copied = true; setTimeout(() => copied = false, 2000)"
                >
                    <span x-show="! copied">{{ __('Copy') }}</span>
                    <span x-show="copied" x-cloak>{{ __('Copied') }}</span>
                </flux:button>
            </div>
        </div>

        <div class="flex flex-col gap-4">
            <flux:heading size="lg" level="2">{{ __('Today\'s level') }}</flux:heading>

            <flux:field>
                <flux:select wire:model.live="levelId" :placeholder="__('Pick a level')">
                    @foreach ($this->levels as $level)
                        <flux:select.option
                            :value="$level->id"
                            :disabled="! $level->isUnlockedFor($factory)"
                            wire:key="level-{{ $level->id }}"
                        >
                            {{ $level->isUnlockedFor($factory) ? $level->name : $level->name.' — locked' }}
                        </flux:select.option>
                    @endforeach
                </flux:select>
                <flux:error name="levelId" />
            </flux:field>
        </div>
    </div>

    <div class="flex flex-col gap-4">
        <flux:heading size="lg" level="2">{{ __('Run history') }}</flux:heading>

        @if ($runs->isEmpty())
            <flux:text>{{ __('No days on the books yet.') }}</flux:text>
        @else
            <flux:table>
                <flux:table.columns>
                    <flux:table.column>{{ __('Day') }}</flux:table.column>
                    <flux:table.column>{{ __('Level') }}</flux:table.column>
                    <flux:table.column>{{ __('Grade') }}</flux:table.column>
                    <flux:table.column>{{ __('Status') }}</flux:table.column>
                    <flux:table.column>{{ __('Profit') }}</flux:table.column>
                    <flux:table.column>{{ __('Coin') }}</flux:table.column>
                    <flux:table.column>{{ __('Ended') }}</flux:table.column>
                </flux:table.columns>

                <flux:table.rows>
                    @foreach ($runs as $run)
                        <flux:table.row wire:key="run-{{ $run->id }}">
                            <flux:table.cell>{{ __('Day :day', ['day' => $run->day]) }}</flux:table.cell>
                            <flux:table.cell>{{ $run->level->name }}</flux:table.cell>
                            <flux:table.cell><flux:badge size="sm">{{ $run->grade }}</flux:badge></flux:table.cell>
                            <flux:table.cell>{{ $run->status->value }}</flux:table.cell>
                            <flux:table.cell>{{ $run->profit }}</flux:table.cell>
                            <flux:table.cell>{{ $run->coin_earned }}</flux:table.cell>
                            <flux:table.cell>{{ $run->ended_at->diffForHumans() }}</flux:table.cell>
                        </flux:table.row>
                    @endforeach
                </flux:table.rows>
            </flux:table>
        @endif
    </div>
</section>
