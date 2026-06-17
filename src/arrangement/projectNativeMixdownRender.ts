import {sendNativeAudioCommand} from '../native/NativeAudioEngine';
import {canceledExportResult, isExportCanceled} from './projectExportCancellation';
import {reportExportProgress, type ProjectExportActionOptions} from './projectExportProgress';

export type MixdownRenderTarget = {
  startBeat?: number;
  endBeat?: number;
  trackId?: string;
  tailBeats?: number;
};

export type MixdownRenderResult =
  | {ok: true; path: string}
  | {ok: false; error: string; canceled?: boolean};

type NativeCommandResponse = {
  ok?: boolean;
  data?: {
    status?: string;
    requestId?: string;
    path?: string;
    progress?: number;
    error?: string;
  };
  error?: {message?: string};
};

let renderRequestSequence = 0;

function parseNativeResponse(rawResponse: string | null, fallbackError: string): NativeCommandResponse {
  if (!rawResponse) {
    return {ok: false, error: {message: 'Native audio engine is unavailable.'}};
  }
  try {
    return JSON.parse(rawResponse) as NativeCommandResponse;
  } catch {
    return {ok: false, error: {message: fallbackError}};
  }
}

function sendRenderCommand(
  command: string,
  payload: Record<string, unknown>,
  fallbackError: string,
): NativeCommandResponse {
  try {
    return parseNativeResponse(sendNativeAudioCommand(command, payload), fallbackError);
  } catch (error) {
    return {
      ok: false,
      error: {message: error instanceof Error ? error.message : fallbackError},
    };
  }
}

function renderRequestId(): string {
  renderRequestSequence += 1;
  return `mixdown-${Date.now()}-${renderRequestSequence}`;
}

function renderPayload(path: string, target?: Partial<MixdownRenderTarget>) {
  return target ? {path, ...target} : {path};
}

function cancelNativeRender(requestId: string): void {
  try {
    sendNativeAudioCommand('cancel_render_mixdown', {requestId});
  } catch {
    // Cancellation is best-effort; the status poll will surface any native failure.
  }
}

function waitForNextPoll(): Promise<void> {
  return new Promise(resolve => {
    globalThis.setTimeout(resolve, 50);
  });
}

async function asyncRenderMixdown(
  path: string,
  target: Partial<MixdownRenderTarget> | undefined,
  options: ProjectExportActionOptions | undefined,
  fallbackError: string,
): Promise<MixdownRenderResult> {
  const requestId = renderRequestId();
  let cancelRequested = false;
  const requestNativeCancel = () => {
    if (!cancelRequested) {
      cancelRequested = true;
      cancelNativeRender(requestId);
    }
  };
  const cancelOnAbort = () => requestNativeCancel();
  options?.abortSignal?.addEventListener('abort', cancelOnAbort, {once: true});

  try {
    const started = sendRenderCommand(
      'render_mixdown_async',
      {
        requestId,
        ...renderPayload(path, target),
      },
      fallbackError,
    );
    if (started.ok !== true) {
      return {ok: false, error: started.error?.message ?? fallbackError};
    }

    for (;;) {
      if (isExportCanceled(options)) {
        requestNativeCancel();
        return canceledExportResult();
      }

      const status = sendRenderCommand(
        'get_render_mixdown_status',
        {requestId},
        fallbackError,
      );
      if (status.ok !== true) {
        return {ok: false, error: status.error?.message ?? fallbackError};
      }

      const state = status.data?.status;
      if (state === 'completed') {
        return {ok: true, path: status.data?.path ?? path};
      }
      if (state === 'canceled') {
        return canceledExportResult();
      }
      if (state === 'failed') {
        return {ok: false, error: status.data?.error ?? fallbackError};
      }
      if (state !== 'running' && state !== 'queued' && state !== 'canceling') {
        return {ok: false, error: 'Mixdown render returned an unknown status.'};
      }

      reportExportProgress(options, 'Rendering mixdown', status.data?.progress);
      await waitForNextPoll();
    }
  } finally {
    options?.abortSignal?.removeEventListener('abort', cancelOnAbort);
  }
}

export async function renderNativeMixdown(
  path: string,
  target?: Partial<MixdownRenderTarget>,
  options?: ProjectExportActionOptions,
  message = 'Rendering mixdown',
): Promise<MixdownRenderResult> {
  if (isExportCanceled(options)) {
    return canceledExportResult();
  }

  reportExportProgress(options, message);
  const fallbackError = 'Mixdown export failed.';
  return asyncRenderMixdown(path, target, options, fallbackError);
}
