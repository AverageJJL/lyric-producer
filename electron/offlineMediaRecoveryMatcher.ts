import * as fs from 'node:fs';
import * as path from 'node:path';

export type OfflineMediaSourceRequest = {
  sourceKey?: string;
  sourcePath?: string;
  name?: string;
};

export type OfflineMediaMatch = {
  source: OfflineMediaSourceRequest;
  absolutePath: string;
};

const audioExtensions = new Set(['.wav', '.aif', '.aiff', '.flac', '.ogg', '.mp3', '.m4a']);

function sourceFileName(value: string | undefined): string {
  return (value ?? '').split(/[\\/]/).pop()?.trim() ?? '';
}

function normalizedName(value: string | undefined): string {
  return sourceFileName(value).toLowerCase();
}

function normalizedStem(value: string | undefined): string {
  const name = sourceFileName(value).toLowerCase();
  const ext = path.extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

export function isOfflineRecoveryAudioFile(filePath: string): boolean {
  return audioExtensions.has(path.extname(filePath).toLowerCase());
}

export function walkOfflineRecoveryAudioFiles(root: string, maxFiles = 2048): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const found: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 5 || found.length >= maxFiles) {
      return;
    }
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath, depth + 1);
      } else if (isOfflineRecoveryAudioFile(entryPath)) {
        found.push(entryPath);
      }
      if (found.length >= maxFiles) {
        return;
      }
    }
  };

  visit(root, 0);
  return found;
}

export function matchOfflineMediaSources(
  sources: OfflineMediaSourceRequest[],
  candidates: string[],
): OfflineMediaMatch[] {
  const exact = new Map<string, string>();
  const stems = new Map<string, string>();

  for (const candidate of candidates) {
    exact.set(normalizedName(candidate), candidate);
    stems.set(normalizedStem(candidate), candidate);
  }

  const matches: OfflineMediaMatch[] = [];
  for (const source of sources) {
    const possibleExactNames = [
      normalizedName(source.sourcePath),
      normalizedName(source.name),
    ].filter(Boolean);
    const possibleStems = [
      normalizedStem(source.sourcePath),
      normalizedStem(source.name),
    ].filter(Boolean);
    const absolutePath =
      possibleExactNames.map(name => exact.get(name)).find(Boolean) ??
      possibleStems.map(stem => stems.get(stem)).find(Boolean);
    if (absolutePath) {
      matches.push({source, absolutePath});
    }
  }

  return matches;
}
