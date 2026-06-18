import {useCallback, type DragEvent} from 'react';

import type {AudioImportPlacement} from './useAudioImport';
import {fileSystemPath, mediaKindForPath} from './useMediaDropImport';
import type {AudioImportRequest} from '../native/mediaImportApi';
import type {DAWBlock, DAWTrack} from '../store/useDAWStore';
import {suppressImportedBlockPointerDrag} from '../ui/timelineImportDragSuppression';

type ImportAudioFile = (
  request?: AudioImportRequest,
  placement?: AudioImportPlacement,
) => Promise<DAWBlock | null>;

type TimelineAudioDropOptions = {
  tracks: DAWTrack[];
  importAudioFile: ImportAudioFile;
  trackIdAtClientY: (clientY: number) => string | null;
  beatAtClientX: (clientX: number) => number | null;
  onDropHandled: () => void;
};

type DroppedAudioFile = {
  path: string;
};

function dataTransferHasFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types ?? []).includes('Files');
}

function droppedAudioFiles(event: DragEvent<HTMLElement>): DroppedAudioFile[] | null {
  const audioFiles: DroppedAudioFile[] = [];
  for (const file of Array.from(event.dataTransfer.files ?? [])) {
    const path = fileSystemPath(file);
    if (!path || mediaKindForPath(path ?? file.name) !== 'audio') {
      return null;
    }
    audioFiles.push({path});
  }
  return audioFiles;
}

export function useTimelineAudioDropImport({
  tracks,
  importAudioFile,
  trackIdAtClientY,
  beatAtClientX,
  onDropHandled,
}: TimelineAudioDropOptions) {
  const handleTimelineAudioDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!dataTransferHasFiles(event)) {
      return false;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    return true;
  }, []);

  const handleTimelineAudioDrop = useCallback((event: DragEvent<HTMLElement>) => {
    const files = droppedAudioFiles(event);
    if (!files || files.length === 0) {
      return false;
    }

    const startBeat = beatAtClientX(event.clientX);
    if (startBeat === null) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    onDropHandled();

    const candidateTrackId = trackIdAtClientY(event.clientY);
    const preferredTrackId = tracks.some(track =>
      track.id === candidateTrackId && track.type === 'voice_audio',
    )
      ? candidateTrackId
      : null;

    void (async () => {
      for (let index = 0; index < files.length; index += 1) {
        const importedBlock = await importAudioFile(
          {path: files[index]!.path},
          {startBeat, preferredTrackId, stackIndex: index},
        );
        if (importedBlock) {
          suppressImportedBlockPointerDrag(importedBlock.id);
        }
      }
    })();

    return true;
  }, [beatAtClientX, importAudioFile, onDropHandled, trackIdAtClientY, tracks]);

  return {
    handleTimelineAudioDragOver,
    handleTimelineAudioDrop,
  };
}
