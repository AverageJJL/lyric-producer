import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  defaultDownloadFile,
  type DownloadFile,
  readJson,
  safeJoin,
  validateManifest,
  verifiedBytes,
} from './sampleLibraryDownload';
import type {
  SampleLibraryCatalog,
  SampleLibraryManifest,
  SampleLibraryManifestFile,
  SampleLibraryPackCatalog,
  SampleLibraryPackManifest,
  SampleLibraryPackStatus,
  SampleLibraryRequest,
  SampleLibraryResponse,
  SampleLibraryState,
  SampleLibraryStatus,
} from './sampleLibraryTypes';

export const DEFAULT_SAMPLE_LIBRARY_ID = 'cc0-core';

type AssetRoots = {readRoot: string; writableRoot: string};
type SampleLibraryManagerOptions = {
  assetRoots: () => AssetRoots;
  manifestUrl?: () => string | undefined;
  downloadFile?: DownloadFile;
};

type ActiveDownload = {
  canceled: boolean;
  packId?: string;
};

const installedManifestName = '.manifest.json';

function emptyCatalog(): SampleLibraryCatalog {
  return {
    libraryId: DEFAULT_SAMPLE_LIBRARY_ID,
    displayName: 'CC0 Core Library',
    license: 'CC0-1.0',
    packs: [],
  };
}

function catalogPack(pack: SampleLibraryPackManifest): SampleLibraryPackCatalog {
  return {
    id: pack.packId,
    family: pack.family,
    displayName: pack.displayName,
    license: pack.license,
    licenseUrl: pack.licenseUrl,
    description: pack.description,
    sourceName: pack.sourceName,
    sourceUrl: pack.sourceUrl,
    fileCount: pack.files.length,
    totalBytes: pack.files.reduce((sum, file) => sum + file.bytes, 0),
  };
}

function catalogFromManifest(manifest: SampleLibraryManifest): SampleLibraryCatalog {
  return {
    libraryId: manifest.libraryId,
    displayName: manifest.displayName,
    license: manifest.license,
    licenseUrl: manifest.licenseUrl,
    description: manifest.description,
    packs: manifest.packs.map(catalogPack),
  };
}

function aggregateState(packs: SampleLibraryPackStatus[], active?: ActiveDownload): SampleLibraryState {
  if (active) {
    return 'downloading';
  }
  if (packs.some(pack => pack.state === 'error')) {
    return 'error';
  }
  if (packs.length > 0 && packs.every(pack => pack.state === 'installed')) {
    return 'installed';
  }
  return packs.some(pack => pack.installedBytes > 0) ? 'partial' : 'missing';
}

export class SampleLibraryManager {
  private active: ActiveDownload | null = null;

  constructor(private readonly options: SampleLibraryManagerOptions) {}

  async status(): Promise<SampleLibraryStatus> {
    return this.buildStatus();
  }

  async cancel(request?: SampleLibraryRequest): Promise<SampleLibraryStatus> {
    if (this.active && (!request?.packId || !this.active.packId || request.packId === this.active.packId)) {
      this.active.canceled = true;
    }
    return this.buildStatus();
  }

  async delete(request: SampleLibraryRequest): Promise<SampleLibraryResponse> {
    if (!request?.packId) {
      return {ok: false, error: 'Sample library pack id is required.'};
    }
    if (this.active && (!this.active.packId || this.active.packId === request.packId)) {
      return {ok: false, error: 'Cancel the pack download before deleting it.'};
    }
    fs.rmSync(this.packRoot(request.packId), {recursive: true, force: true});
    return this.buildStatus();
  }

  async download(request?: SampleLibraryRequest): Promise<SampleLibraryResponse> {
    if (this.active) {
      return {ok: false, error: 'Sample library download is already running.'};
    }
    this.active = {canceled: false, packId: request?.packId};
    try {
      const manifest = await this.loadManifest();
      const selectedPacks = request?.packId
        ? manifest.packs.filter(pack => pack.packId === request.packId)
        : manifest.packs;
      if (selectedPacks.length === 0) {
        return {ok: false, error: 'Sample library pack was not found.'};
      }
      for (const pack of selectedPacks) {
        await this.downloadPack(pack);
      }
      const catalog = catalogFromManifest(manifest);
      this.writeInstalledCatalog(catalog);
      return this.buildStatus(catalog);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not download sample library.';
      const status = await this.buildStatus();
      return {...status, state: 'error', error: message};
    } finally {
      this.active = null;
    }
  }

  private readCatalog(): SampleLibraryCatalog {
    const {readRoot, writableRoot} = this.options.assetRoots();
    const installedCatalog = readJson<SampleLibraryCatalog>(
      path.join(writableRoot, 'sample-library', `${DEFAULT_SAMPLE_LIBRARY_ID}.catalog.json`),
    );
    if (installedCatalog && !installedCatalog.packs.some(pack =>
      pack.id === 'core-keys' && /splendid grand piano/i.test(pack.sourceName ?? ''))) {
      return installedCatalog;
    }
    const catalogPath = path.join(readRoot, 'sample-library', `${DEFAULT_SAMPLE_LIBRARY_ID}.catalog.json`);
    return readJson<SampleLibraryCatalog>(catalogPath) ?? emptyCatalog();
  }

  private writeInstalledCatalog(catalog: SampleLibraryCatalog): void {
    const {writableRoot} = this.options.assetRoots();
    const catalogPath = path.join(writableRoot, 'sample-library', `${DEFAULT_SAMPLE_LIBRARY_ID}.catalog.json`);
    fs.mkdirSync(path.dirname(catalogPath), {recursive: true});
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  }

  private devManifestPath(): string {
    const {readRoot} = this.options.assetRoots();
    return path.join(readRoot, 'sample-library', `${DEFAULT_SAMPLE_LIBRARY_ID}.dev-manifest.json`);
  }

  private packRoot(packId: string): string {
    const {writableRoot} = this.options.assetRoots();
    return path.join(writableRoot, 'sample-library', packId);
  }

  private installedManifestPath(packId: string): string {
    return path.join(this.packRoot(packId), installedManifestName);
  }

  private hasLocalAssetSources(manifest: SampleLibraryManifest): boolean {
    const {readRoot} = this.options.assetRoots();
    return manifest.packs.every(pack => pack.files.every(file => {
      if (!file.url.startsWith('asset:')) {
        return true;
      }
      const sourcePath = safeJoin(readRoot, file.url.slice('asset:'.length));
      return Boolean(sourcePath && fs.existsSync(sourcePath));
    }));
  }

  private async loadManifest(): Promise<SampleLibraryManifest> {
    const manifestUrl = this.options.manifestUrl?.() ?? process.env.AI_PRODUCER_SAMPLE_LIBRARY_MANIFEST_URL;
    if (!manifestUrl) {
      const devManifest = readJson<SampleLibraryManifest>(this.devManifestPath());
      if (devManifest && this.hasLocalAssetSources(devManifest)) {
        return validateManifest(devManifest);
      }
      throw new Error('Sample library manifest URL is not configured.');
    }
    if (manifestUrl.startsWith('file:')) {
      return validateManifest(JSON.parse(fs.readFileSync(fileURLToPath(manifestUrl), 'utf8')));
    }
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      throw new Error(`Sample library manifest failed with HTTP ${response.status}.`);
    }
    return validateManifest(await response.json());
  }

  private async buildPackStatus(pack: SampleLibraryPackCatalog): Promise<SampleLibraryPackStatus> {
    const manifest = readJson<SampleLibraryPackManifest>(this.installedManifestPath(pack.id));
    const installedBytes = manifest ? await this.verifiedInstalledBytes(manifest) : 0;
    const state = this.active?.packId === pack.id || (this.active && !this.active.packId)
      ? 'downloading'
      : installedBytes === pack.totalBytes && pack.totalBytes > 0
        ? 'installed'
        : installedBytes > 0
          ? 'partial'
          : 'missing';
    return {...pack, state, installedBytes};
  }

  private async buildStatus(catalog = this.readCatalog()): Promise<SampleLibraryStatus> {
    const packs = await Promise.all(catalog.packs.map(pack => this.buildPackStatus(pack)));
    const installedBytes = packs.reduce((sum, pack) => sum + pack.installedBytes, 0);
    return {
      ok: true,
      libraryId: catalog.libraryId,
      displayName: catalog.displayName,
      license: catalog.license,
      state: aggregateState(packs, this.active ?? undefined),
      packs,
      installedBytes,
      totalBytes: packs.reduce((sum, pack) => sum + pack.totalBytes, 0),
      fileCount: packs.reduce((sum, pack) => sum + pack.fileCount, 0),
      activePackId: this.active?.packId,
    };
  }

  private async verifiedInstalledBytes(pack: SampleLibraryPackManifest): Promise<number> {
    let installedBytes = 0;
    for (const file of pack.files) {
      const absolutePath = safeJoin(this.packRoot(pack.packId), file.relativePath);
      if (absolutePath) {
        installedBytes += await verifiedBytes(absolutePath, file);
      }
    }
    return installedBytes;
  }

  private async downloadSampleFile(file: SampleLibraryManifestFile, targetPath: string): Promise<void> {
    if (file.url.startsWith('asset:')) {
      const {readRoot} = this.options.assetRoots();
      const sourcePath = safeJoin(readRoot, file.url.slice('asset:'.length));
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        throw new Error(`Local sample source is missing: ${file.displayName}`);
      }
      fs.copyFileSync(sourcePath, targetPath);
      return;
    }
    const downloadFile = this.options.downloadFile ?? defaultDownloadFile;
    await downloadFile(file.url, targetPath, () => Boolean(this.active?.canceled));
  }

  private async downloadPack(pack: SampleLibraryPackManifest): Promise<void> {
    fs.mkdirSync(this.packRoot(pack.packId), {recursive: true});
    for (const file of pack.files) {
      if (this.active?.canceled) {
        throw new Error('Download canceled.');
      }
      const targetPath = safeJoin(this.packRoot(pack.packId), file.relativePath);
      if (!targetPath) {
        throw new Error(`Unsafe sample library path: ${file.relativePath}`);
      }
      if ((await verifiedBytes(targetPath, file)) === file.bytes) {
        continue;
      }
      fs.mkdirSync(path.dirname(targetPath), {recursive: true});
      const tempPath = `${targetPath}.download`;
      fs.rmSync(tempPath, {force: true});
      try {
        await this.downloadSampleFile(file, tempPath);
        if ((await verifiedBytes(tempPath, file)) !== file.bytes) {
          throw new Error(`Downloaded sample failed integrity check: ${file.displayName}`);
        }
        fs.renameSync(tempPath, targetPath);
      } catch (error) {
        fs.rmSync(tempPath, {force: true});
        throw error;
      }
    }
    fs.writeFileSync(this.installedManifestPath(pack.packId), JSON.stringify(pack, null, 2), 'utf8');
  }
}
