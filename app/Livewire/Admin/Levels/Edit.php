<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Levels;

use App\Game\LevelSchemaValidator;
use App\Models\Level;
use Illuminate\View\View;
use JsonException;
use Livewire\Component;
use stdClass;

class Edit extends Component
{
    public Level $level;

    public string $json = '';

    /** @var array<string, list<string>> */
    public array $schemaErrors = [];

    public bool $validated = false;

    public function mount(Level $level): void
    {
        $this->authorize('admin');

        $this->level = $level;
        $this->json = (string) json_encode(
            $level->config,
            JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_SLASHES
        );
    }

    /**
     * Show every problem at once, then let save() run the same checks again:
     * an editor that saves what it just called invalid is worse than no editor.
     */
    public function validateJson(): ?stdClass
    {
        $this->resetErrorBag();
        $this->schemaErrors = [];
        $this->validated = false;

        try {
            $config = json_decode($this->json, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            $this->addError('json', __('Not valid JSON: :message', ['message' => $e->getMessage()]));

            return null;
        }

        if (! $config instanceof stdClass) {
            $this->addError('json', __('A level config must be a JSON object.'));

            return null;
        }

        if (($config->key ?? null) !== $this->level->key) {
            $this->addError('json', __('key cannot change; rename the file and re-sync.'));

            return null;
        }

        $this->schemaErrors = app(LevelSchemaValidator::class)->errors($config);

        if ($this->schemaErrors !== []) {
            return null;
        }

        $this->validated = true;

        return $config;
    }

    public function save(): void
    {
        $this->authorize('admin');

        $config = $this->validateJson();

        if ($config === null) {
            return;
        }

        $this->level->update(['config' => $config, 'name' => $config->name]);

        session()->flash('status', __('Saved'));
    }

    public function render(): View
    {
        return view('livewire.admin.levels.edit');
    }
}
