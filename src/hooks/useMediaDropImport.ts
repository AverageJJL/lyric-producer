import {useCallback, useRef, useState, type DragEvent} from 'react';

import type {AudioImportRequest} from '../native/mediaImportApi';

type ImportMediaFile = (request?: AudioImportRequest) => Promise<void>;
type MediaKind = 'audio' | 'midi';
type DroppedFile = File & {path?: string};

const audioExtensions = new Set(['wav', 'aif', 'aiff', 'flac', 'ogg', 'mp3', 'm4a']);
const midiExtensions = new Set(['mid', 'midi']);

function extensionForPath(filePath: string): string {
  const lastSegment = filePath.split(/[\\/]/).pop() ?? filePath;
  const dotIndex = lastSegment.lastIndexOf('.');
  return dotIndex >= 0 ? lastSegment.slice(dotIndex + 1).toLowerCase() : '';
}

export function mediaKindForPath(filePath: string): MediaKind | null {
  const extension = extensionForPath(filePath);
  if (audioExtensions.has(extension)) {
    return 'audio';
  }
  if (midiExtensions.has(extension)) {
    return 'midi';
  }
  return null;
}

function fileSystemPath(file: File): string | null {
  const filePath = (file as DroppedFile).path;
  return typeof filePath === 'string' && filePath.length > 0 ? filePath : null;
}

export function useMediaDropImport(
  importAudioFile: ImportMediaFile,
  importMidiFile: ImportMediaFile,
) {
  const [isDraggingMedia, setIsDraggingMedia] = useState(false);
  const [dropImportError, setDropImportError] = useState<string | null>(null);
  const dragDepthRef = useRef(0);

  const handleDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    setDropImportError(null);
    setIsDraggingMedia(true);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDraggingMedia(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingMedia(false);
    }
  }, []);

  const handleDrop = useCallback(async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingMedia(false);
    setDropImportError(null);

    const files = Array.from(event.dataTransfer.files ?? []);
    let importedCount = 0;
    let missingPathCount = 0;
    for (const file of files) {
      const path = fileSystemPath(file);
      const kind = mediaKindForPath(path ?? file.name);
      if (!kind) {
        continue;
      }
      if (!path) {
        missingPathCount += 1;
        continue;
      }
      importedCount += 1;
      if (kind === 'audio') {
        await importAudioFile({path});
      } else {
        await importMidiFile({path});
      }
    }

    if (missingPathCount > 0) {
      setDropImportError('Dropped files must include a filesystem path.');
    } else if (files.length > 0 && importedCount === 0) {
      setDropImportError('Drop audio or MIDI files to import.');
    }
  }, [importAudioFile, importMidiFile]);

  return {
    dropImportError,
    isDraggingMedia,
    dropImportProps: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
