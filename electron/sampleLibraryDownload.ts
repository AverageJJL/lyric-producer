import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

import type {SampleLibraryManifest, SampleLibraryManifestFile} from './sampleLibraryTypes';

export type DownloadFile = (
  url: string,
  targetPath: string,
  isCanceled: () => boolean,
) => Promise<void>;

export function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

export function safeJoin(root: string, relativePath: string): string | null {
  const absolute = path.resolve(root, relativePath);
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  return absolute.startsWith(rootPrefix) ? absolute : null;
}

export function validateManifest(value: unknown): SampleLibraryManifest {
  const manifest = value as SampleLibraryManifest;
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.packs)) {
    throw new Error('Sample library manifest is invalid.');
  }
  for (const key of ['libraryId', 'displayName', 'license'] as const) {
    if (typeof manifest[key] !== 'string' || !manifest[key].trim()) {
      throw new Error(`Sample library manifest is missing ${key}.`);
    }
  }
  manifest.packs.forEach(pack => {
    if (
      !pack ||
      typeof pack.packId !== 'string' ||
      typeof pack.family !== 'string' ||
      typeof pack.displayName !== 'string' ||
      typeof pack.license !== 'string' ||
      !Array.isArray(pack.files)
    ) {
      throw new Error('Sample library manifest has an invalid pack entry.');
    }
    pack.files.forEach(file => {
      if (
        !file ||
        typeof file.packId !== 'string' ||
        typeof file.family !== 'string' ||
        typeof file.relativePath !== 'string' ||
        typeof file.url !== 'string' ||
        typeof file.displayName !== 'string' ||
        typeof file.sha256 !== 'string' ||
        typeof file.bytes !== 'number' ||
        typeof file.sourceName !== 'string' ||
        typeof file.sourceUrl !== 'string' ||
        typeof file.license !== 'string' ||
        typeof file.licenseUrl !== 'string' ||
        !Array.isArray(file.tags)
      ) {
        throw new Error('Sample library manifest has an invalid file entry.');
      }
      if (file.packId !== pack.packId || file.family !== pack.family) {
        throw new Error('Sample library manifest file does not match its pack.');
      }
    });
  });
  return manifest;
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('data', chunk => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function verifiedBytes(
  filePath: string,
  file: SampleLibraryManifestFile,
): Promise<number> {
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  const stats = fs.statSync(filePath);
  if (stats.size !== file.bytes) {
    return 0;
  }
  return (await sha256File(filePath)) === file.sha256.toLowerCase() ? file.bytes : 0;
}

async function downloadHttp(url: URL, targetPath: string, isCanceled: () => boolean): Promise<void> {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get(url, response => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadHttp(new URL(response.headers.location, url), targetPath, isCanceled).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode ?? 'unknown'}.`));
        return;
      }
      const output = fs.createWriteStream(targetPath);
      response.on('data', () => {
        if (isCanceled()) {
          request.destroy(new Error('Sample library download canceled.'));
        }
      });
      output.on('finish', () => output.close(() => resolve()));
      output.on('error', reject);
      response.on('error', reject);
      response.pipe(output);
    });
    request.on('error', reject);
  });
}

export async function defaultDownloadFile(
  url: string,
  targetPath: string,
  isCanceled: () => boolean,
): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol === 'file:') {
    if (isCanceled()) {
      throw new Error('Sample library download canceled.');
    }
    fs.copyFileSync(fileURLToPath(parsed), targetPath);
    return;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Sample library file URL must be http, https, or file.');
  }
  await downloadHttp(parsed, targetPath, isCanceled);
}
