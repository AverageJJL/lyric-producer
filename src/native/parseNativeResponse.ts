export function parseNativeCommandOk(response: string | null): boolean {
  if (!response) {
    return false;
  }

  try {
    const parsed = JSON.parse(response) as {ok?: boolean};
    return Boolean(parsed.ok);
  } catch {
    return false;
  }
}

export function parseNativeCommandError(response: string | null): string | null {
  if (!response) {
    return 'Native audio engine is not available.';
  }

  try {
    const parsed = JSON.parse(response) as {
      ok?: boolean;
      error?: {code?: string; message?: string};
    };
    if (parsed.ok) {
      return null;
    }
    return parsed.error?.message ?? 'Audio command failed.';
  } catch {
    return 'Invalid response from audio engine.';
  }
}
