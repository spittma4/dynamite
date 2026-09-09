<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\FactoryRole;
use App\Models\Factory;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the two playtest accounts and the factory they share.
     *
     * Levels are not seeded here: they come from disk through
     * "game:levels:sync", which needs the shared schema and the level files.
     */
    public function run(): void
    {
        $sam = $this->account('sam@example.com', 'Sam', isAdmin: true);
        $priya = $this->account('priya@example.com', 'Priya');

        $factory = Factory::firstOrCreate(
            ['join_code' => 'BANG42'],
            [
                'owner_id' => $sam->id,
                'name' => 'Kaboom & Sons',
                'level_id' => null,
                'coin' => 0,
                'day' => 1,
                // M1 ships four campaign levels and the playtest factory has to
                // be able to reach every one of them.
                'unlocked_level' => 4,
            ],
        );

        $factory->addMember($sam, FactoryRole::Owner);
        $factory->addMember($priya, FactoryRole::Member);
    }

    /**
     * "is_admin" is deliberately not mass assignable, so set it by force
     * rather than leaning on the seed command's unguarded scope.
     */
    private function account(string $email, string $name, bool $isAdmin = false): User
    {
        $user = User::firstOrNew(['email' => $email]);

        $user->forceFill([
            'name' => $name,
            'password' => Hash::make('password'),
            'email_verified_at' => $user->email_verified_at ?? now(),
            'is_admin' => $isAdmin,
        ])->save();

        return $user;
    }
}
