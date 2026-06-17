import type {ProjectExportActionOptions} from './projectExportProgress';

export const EXPORT_CANCELED_MESSAGE = 'Export canceled.';

export function isExportCanceled(options: ProjectExportActionOptions | undefined): boolean {
  return options?.abortSignal?.aborted === true;
}

export function canceledExportResult() {
  return {ok: false as const, canceled: true as const, error: EXPORT_CANCELED_MESSAGE};
}
