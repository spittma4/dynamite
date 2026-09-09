<?php

declare(strict_types=1);

namespace App\Http\Controllers\Internal;

use App\Actions\StoreRun;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRunRequest;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

class StoreRunController extends Controller
{
    public function __invoke(StoreRunRequest $request, StoreRun $storeRun): JsonResponse
    {
        $run = $storeRun->handle($request->all());

        return response()->json(
            ['ok' => true, 'runId' => $run->id],
            $run->wasRecentlyCreated ? Response::HTTP_CREATED : Response::HTTP_OK,
        );
    }
}
