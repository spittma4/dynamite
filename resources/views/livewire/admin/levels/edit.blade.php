<section class="flex w-full flex-col gap-6">
    <div>
        <flux:heading size="xl" level="1">{{ $level->name }}</flux:heading>
        <flux:subheading class="font-mono">{{ $level->key }}</flux:subheading>
    </div>

    @if (session('status'))
        <flux:callout variant="success" icon="check-circle" :heading="session('status')" />
    @endif

    @if ($schemaErrors)
        <flux:callout variant="danger" icon="exclamation-triangle" :heading="__('Schema errors')">
            <flux:callout.text>
                <ul class="list-disc ps-5">
                    @foreach ($schemaErrors as $pointer => $messages)
                        @foreach ($messages as $message)
                            <li wire:key="error-{{ $loop->parent->index }}-{{ $loop->index }}">
                                <span class="font-mono">{{ $pointer }}</span> — {{ $message }}
                            </li>
                        @endforeach
                    @endforeach
                </ul>
            </flux:callout.text>
        </flux:callout>
    @elseif ($validated)
        <flux:callout variant="success" icon="check-circle" :heading="__('Valid')" />
    @endif

    <flux:field>
        <flux:label>{{ __('Level config') }}</flux:label>
        <flux:textarea wire:model="json" rows="24" class="font-mono text-xs" />
        <flux:error name="json" />
    </flux:field>

    <div class="flex items-center gap-4">
        <flux:button wire:click="validateJson">{{ __('Validate') }}</flux:button>
        <flux:button variant="primary" wire:click="save">{{ __('Save') }}</flux:button>
        <flux:button variant="ghost" :href="route('admin.levels.index')" wire:navigate>{{ __('Back') }}</flux:button>
    </div>
</section>
