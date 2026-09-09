<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>{{ $factory->name }}</title>

        {{-- The client needs a definite box to fit its canvas into. --}}
        <style>
            body { margin: 0; background: #000; overflow: hidden; }
            #game { width: 100vw; height: 100vh; }
        </style>
    </head>
    <body>
        <div id="game" data-ticket-url="{{ route('game.ticket') }}" data-factory-id="{{ $factory->id }}"
             data-ws-url="{{ config('game.ws_url') }}" data-csrf="{{ csrf_token() }}" data-debug="{{ $debug ? 1 : 0 }}"
             data-factory-url="{{ route('factories.show', $factory) }}"></div>
        @vite('resources/js/game/main.ts')
    </body>
</html>
