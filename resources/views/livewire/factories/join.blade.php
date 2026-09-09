<section class="mx-auto w-full max-w-md">
    <flux:heading size="xl" level="1">{{ __('Join a factory') }}</flux:heading>
    <flux:subheading class="mb-6">{{ __('Ask whoever runs the shop for its six character code.') }}</flux:subheading>

    <form wire:submit="join" class="flex flex-col gap-6">
        <flux:input
            wire:model="code"
            :label="__('Join code')"
            type="text"
            class="font-mono uppercase"
            maxlength="8"
            required
            autofocus
        />

        <div class="flex items-center gap-4">
            <flux:button variant="primary" type="submit">{{ __('Join factory') }}</flux:button>
            <flux:button variant="ghost" :href="route('factories.index')" wire:navigate>{{ __('Cancel') }}</flux:button>
        </div>
    </form>
</section>
