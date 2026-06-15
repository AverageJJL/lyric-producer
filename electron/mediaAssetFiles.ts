import * as fs from 'node:fs';
import * as path from 'node:path';

type MediaAssetConfig = {
  assetRoots: () => {readRoot: string; writableRoot: string};
};

export function resolveWritableAssetPath(
  config: MediaAssetConfig,
  relativePath: string,
): string | null {
  const {writableRoot} = config.assetRoots();
  const absolutePath = path.resolve(writableRoot, relativePath);
  const rootWithSeparator = `${path.resolve(writableRoot)}${path.sep}`;
  return absolutePath.startsWith(rootWithSeparator) ? absolutePath : null;
}

function uniqueImportPath(config: MediaAssetConfig, filePath: string): string {
  const {writableRoot} = config.assetRoots();
  const importsDir = path.join(writableRoot, 'imports');
  fs.mkdirSync(importsDir, {recursive: true});

  const parsed = path.parse(filePath);
  let candidate = path.join(importsDir, parsed.base);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(importsDir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

function wavFileName(fileName: string | undefined): string {
  const safeName = fileName && fileName.trim() ? fileName.trim() : 'Rendered Audio.wav';
  return path.extname(safeName).toLowerCase() === '.wav' ? safeName : `${safeName}.wav`;
}

export function reserveRenderedAudioImportPath(
  config: MediaAssetConfig,
  fileName?: string,
) {
  const absolutePath = uniqueImportPath(config, wavFileName(fileName));
  return {
    ok: true,
    originalPath: absolutePath,
    absolutePath,
    relativePath: `imports/${path.basename(absolutePath)}`,
    name: path.parse(absolutePath).name || 'Rendered Audio',
  };
}

export function copyMediaFileIntoImports(
  config: MediaAssetConfig,
  sourcePath: string,
) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error('Audio media file could not be found.');
  }

  const absolutePath = uniqueImportPath(config, sourcePath);
  fs.copyFileSync(sourcePath, absolutePath);
  return {
    ok: true,
    originalPath: sourcePath,
    absolutePath,
    relativePath: `imports/${path.basename(absolutePath)}`,
    name: path.parse(sourcePath).name || 'Imported Audio',
  };
}

export async function copyMediaFileIntoImportsAsync(
  config: MediaAssetConfig,
  sourcePath: string,
) {
  try {
    await fs.promises.access(sourcePath, fs.constants.F_OK);
  } catch {
    throw new Error('Audio media file could not be found.');
  }

  const absolutePath = uniqueImportPath(config, sourcePath);
  await fs.promises.copyFile(sourcePath, absolutePath);
  return {
    ok: true,
    originalPath: sourcePath,
    absolutePath,
    relativePath: `imports/${path.basename(absolutePath)}`,
    name: path.parse(sourcePath).name || 'Imported Audio',
  };
}

export async function writeMediaBytesIntoImports(
  config: MediaAssetConfig,
  fileName: string,
  data: Uint8Array,
) {
  const safeName = path.basename(fileName) || 'Imported Audio.wav';
  const absolutePath = uniqueImportPath(config, safeName);
  await fs.promises.writeFile(absolutePath, Buffer.from(data));
  return {
    archivePath: fileName,
    absolutePath,
    relativePath: `imports/${path.basename(absolutePath)}`,
    name: path.parse(absolutePath).name || 'Imported Audio',
  };
}
