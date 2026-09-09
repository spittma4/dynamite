<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Game server
    |--------------------------------------------------------------------------
    |
    | The Node/Colyseus process that owns the simulation. Laravel hands the
    | browser a signed ticket and the websocket URL; the game server calls
    | back over the HMAC-signed "/internal" routes using the shared secret.
    |
    */

    'server_url' => env('GAME_SERVER_URL', 'http://127.0.0.1:2567'),

    'ws_url' => env('GAME_SERVER_WS_URL', 'ws://127.0.0.1:2567'),

    'secret' => env('GAME_SERVER_SECRET', ''),

    /*
    |--------------------------------------------------------------------------
    | Level content
    |--------------------------------------------------------------------------
    |
    | Levels and layouts are authored as JSON on disk and seeded into the
    | database by "game:levels:sync". The schema is the shared package's, so
    | Laravel and the game server validate a level against the same document.
    |
    */

    'levels_path' => base_path('config/game/levels'),

    'layouts_path' => base_path('config/game/layouts'),

    'schema_path' => base_path('shared/src/config/schema.json'),

];
