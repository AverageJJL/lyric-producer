import * as fs from 'node:fs';
import * as path from 'node:path';

type AtomicWriteData = string | NodeJS.ArrayBufferView;

function tempPathFor(targetPath: string): string {
  const parsed = path.parse(targetPath);
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return path.join(parsed.dir, `.${parsed.base}.${suffix}.tmp`);
}

function bufferFromView(data: NodeJS.ArrayBufferView): Buffer {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * Write through a sibling temp file so project saves never leave a half-written
 * document at the final path if the process fails before rename.
 */
export function writeFileAtomicSync(
  targetPath: string,
  data: AtomicWriteData,
  encoding?: BufferEncoding,
): void {
  const temporaryPath = tempPathFor(targetPath);
  try {
    const file = fs.openSync(temporaryPath, 'wx');
    try {
      if (typeof data === 'string') {
        fs.writeFileSync(file, data, encoding);
      } else {
        fs.writeFileSync(file, data);
      }
      fs.fsyncSync(file);
    } finally {
      fs.closeSync(file);
    }
    fs.renameSync(temporaryPath, targetPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
    throw error;
  }
}

export async function writeFileAtomic(
  targetPath: string,
  data: AtomicWriteData,
  encoding?: BufferEncoding,
): Promise<void> {
  const temporaryPath = tempPathFor(targetPath);
  try {
    const file = await fs.promises.open(temporaryPath, 'wx');
    try {
      if (typeof data === 'string') {
        await file.writeFile(data, encoding ? {encoding} : undefined);
      } else {
        await file.writeFile(bufferFromView(data));
      }
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.promises.rename(temporaryPath, targetPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) {
      await fs.promises.unlink(temporaryPath);
    }
    throw error;
  }
}
