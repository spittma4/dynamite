<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_dashboard_redirects_to_the_factories_list(): void
    {
        $response = $this->get(route('dashboard'));

        $response->assertRedirect('/factories');
    }

    public function test_guests_reaching_the_factories_list_are_sent_to_the_login_page(): void
    {
        $response = $this->get('/factories');

        $response->assertRedirect(route('login'));
    }

    public function test_authenticated_users_land_on_the_factories_list(): void
    {
        $this->actingAs(User::factory()->create());

        $this->get(route('dashboard'))
            ->assertRedirect('/factories');

        $this->get('/factories')->assertOk();
    }
}
