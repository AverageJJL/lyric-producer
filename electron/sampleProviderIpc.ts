import {ipcMain} from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {verifiedBytes} from './sampleLibraryDownload';
import type {SampleLibraryPackManifest} from './sampleLibraryTypes';

type SampleProviderBrowseRequest = {
  providerId?: string;
  query?: string;
  family?: string;
  tags?: string[];
  limit?: number;
};

type SampleProviderIpcConfig = {
  assetRoots: () => {readRoot: string; writableRoot: string};
};

type SampleProviderEntry = {
  id: string;
  providerId: string;
  providerLabel: string;
  packId?: string;
  packLabel?: string;
  family?: string;
  sourceName?: string;
  license?: string;
  name: string;
  absolutePath: string;
  fileBytes: number;
  modifiedAt: string;
  tags: string[];
};

const audioExtensions = new Set(['.wav', '.aif', '.aiff', '.flac', '.ogg', '.mp3', '.m4a']);

function sampleProviders(writableRoot: string) {
  return [
    {id: 'project_imports', label: 'Project Imports', root: path.join(writableRoot, 'imports')},
    {id: 'recordings', label: 'Recordings', root: path.join(writableRoot, 'recordings')},
    {
      id: 'royalty_free_library',
      label: 'Royalty-Free Library',
      root: path.join(writableRoot, 'sample-library'),
    },
  ];
}

function tagWords(filePath: string, providerId: string): string[] {
  const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
  const words = base.split(/[^a-z0-9]+/).filter(Boolean);
  if (providerId.includes('drums')) {
    words.push('drum', 'one-shot');
  }
  if (providerId === 'recordings') {
    words.push('recording');
  }
  return Array.from(new Set(words));
}

function walkAudioFiles(root: string, maxFiles: number): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const found: string[] = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 3 || found.length >= maxFiles) {
      return;
    }
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath, depth + 1);
      } else if (audioExtensions.has(path.extname(entry.name).toLowerCase())) {
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

function matchesTerms(name: string, tags: string[], terms: string[]): boolean {
  const haystack = `${name} ${tags.join(' ')}`.toLowerCase();
  return terms.every(term => haystack.includes(term));
}

function readPackManifest(manifestPath: string): SampleLibraryPackManifest | null {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as SampleLibraryPackManifest;
    if (
      typeof manifest?.packId !== 'string' ||
      typeof manifest.family !== 'string' ||
      typeof manifest.displayName !== 'string' ||
      !Array.isArray(manifest.files)
    ) {
      return null;
    }
    return manifest;
  } catch {
    return null;
  }
}

async function manifestSamples(provider: {id: string; label: string; root: string}): Promise<SampleProviderEntry[] | null> {
  if (provider.id !== 'royalty_free_library') {
    return null;
  }
  if (!fs.existsSync(provider.root)) {
    return [];
  }
  const samples: SampleProviderEntry[] = [];
  for (const entry of fs.readdirSync(provider.root, {withFileTypes: true})) {
    if (!entry.isDirectory()) {
      continue;
    }
    const packRoot = path.join(provider.root, entry.name);
    const manifestPath = path.join(packRoot, '.manifest.json');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    const manifest = readPackManifest(manifestPath);
    if (!manifest) {
      continue;
    }
    if (manifest.packId === 'core-keys' && manifest.files.some(file =>
      /splendid grand piano/i.test(file.sourceName))) {
      continue;
    }
    for (const file of manifest.files) {
      const absolutePath = path.resolve(packRoot, file.relativePath);
      const rootPrefix = `${path.resolve(packRoot)}${path.sep}`;
      if (!absolutePath.startsWith(rootPrefix) || !fs.existsSync(absolutePath)) {
        continue;
      }
      if ((await verifiedBytes(absolutePath, file)) !== file.bytes) {
        continue;
      }
      const stats = fs.statSync(absolutePath);
      samples.push({
        id: `${provider.id}:${manifest.packId}:${file.relativePath}`,
        providerId: provider.id,
        providerLabel: provider.label,
        packId: manifest.packId,
        packLabel: manifest.displayName,
        family: manifest.family,
        sourceName: file.sourceName,
        license: file.license,
        name: file.displayName,
        absolutePath,
        fileBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        tags: file.tags,
      });
    }
  }
  return samples;
}

export async function browseSamples(config: SampleProviderIpcConfig, request?: SampleProviderBrowseRequest) {
  const {writableRoot} = config.assetRoots();
  const providers = sampleProviders(writableRoot);
  const providerFilter = typeof request?.providerId === 'string' ? request.providerId : '';
  const familyFilter = typeof request?.family === 'string' ? request.family : '';
  const terms = (request?.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const tagFilter = new Set((request?.tags ?? []).map(tag => tag.toLowerCase()));
  const limit = Math.max(1, Math.min(48, Math.floor(request?.limit ?? 24)));

  const providerSamples = await Promise.all(providers
    .filter(provider => !providerFilter || provider.id === providerFilter)
    .map(async provider => {
      const manifestEntries = await manifestSamples(provider);
      if (manifestEntries) {
        return manifestEntries;
      }
      return walkAudioFiles(provider.root, 160).map((absolutePath): SampleProviderEntry => {
        const stats = fs.statSync(absolutePath);
        const name = path.basename(absolutePath, path.extname(absolutePath));
        const tags = tagWords(absolutePath, provider.id);
        return {
          id: `${provider.id}:${path.relative(provider.root, absolutePath)}`,
          providerId: provider.id,
          providerLabel: provider.label,
          name,
          absolutePath,
          fileBytes: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          tags,
        };
      });
    }));

  const samples: SampleProviderEntry[] = providerSamples
    .flat()
    .filter(sample => matchesTerms(sample.name, sample.tags, terms))
    .filter(sample => !familyFilter || sample.family === familyFilter)
    .filter(sample => tagFilter.size === 0 || sample.tags.some(tag => tagFilter.has(tag)))
    .slice(0, limit);

  return {ok: true, providers: providers.map(({id, label}) => ({id, label})), samples};
}

export function registerSampleProviderIpc(config: SampleProviderIpcConfig): void {
  ipcMain.handle('sample-provider:browse', async (_event, request?: SampleProviderBrowseRequest) => {
    try {
      return await browseSamples(config, request);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not browse sample providers.';
      return {ok: false, error: message};
    }
  });
}
