export type ProjectExportProgress = {
  message: string;
  completed?: number;
  total?: number;
};

export type ProjectExportActionOptions = {
  onProgress?: (progress: ProjectExportProgress) => void;
  abortSignal?: AbortSignal;
};

export function reportExportProgress(
  options: ProjectExportActionOptions | undefined,
  message: string,
  completed?: number,
  total?: number,
): void {
  options?.onProgress?.({message, completed, total});
}
