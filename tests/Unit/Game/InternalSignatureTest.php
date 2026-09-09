<?php

declare(strict_types=1);

use App\Game\InternalSignature;

it('signs the uppercased method, the path and the body with no separators', function () {
    $expected = hash_hmac('sha256', 'POST/internal/runs{"seed":1}', 'shhh');

    expect(InternalSignature::sign('post', '/internal/runs', '{"seed":1}', 'shhh'))->toBe($expected);
});

it('leaves the query string out of the canonical string', function () {
    expect(InternalSignature::sign('GET', '/internal/factories/7/config', '', 'shhh'))
        ->toBe(InternalSignature::sign('GET', '/internal/factories/7/config', '', 'shhh'))
        ->not->toBe(InternalSignature::sign('GET', '/internal/factories/7/config?players=4', '', 'shhh'));
});

it('produces lowercase hex', function () {
    $signature = InternalSignature::sign('GET', '/internal/factories/7/config', '', 'shhh');

    expect($signature)->toMatch('/^[0-9a-f]{64}$/');
});

it('changes when the body changes', function () {
    expect(InternalSignature::sign('POST', '/internal/runs', '{"seed":1}', 'shhh'))
        ->not->toBe(InternalSignature::sign('POST', '/internal/runs', '{"seed":2}', 'shhh'));
});

it('changes when the secret changes', function () {
    expect(InternalSignature::sign('POST', '/internal/runs', '{}', 'shhh'))
        ->not->toBe(InternalSignature::sign('POST', '/internal/runs', '{}', 'other'));
});
