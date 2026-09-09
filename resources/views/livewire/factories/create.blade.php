<section class="mx-auto w-full max-w-md">
    <flux:heading size="xl" level="1">{{ __('New factory') }}</flux:heading>
    <flux:subheading class="mb-6">{{ __('Name the shop. You can invite people with its join code.') }}</flux:subheading>

    <form wire:submit="create" class="flex flex-col gap-6">
        <flux:input wire:model="name" :label="__('Factory name')" type="text" required autofocus />

        <div class="flex items-center gap-4">
            <flux:button variant="primary" type="submit">{{ __('Create factory') }}</flux:button>
            <flux:button variant="ghost" :href="route('factories.index')" wire:navigate>{{ __('Cancel') }}</flux:button>
        </div>
    </form>
</section>
