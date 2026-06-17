import {useCallback, useState} from 'react';

import {importMidiTracksAtPlayhead} from '../arrangement/midiImportActions';
import {getMediaImportBridge, type AudioImportRequest} from '../native/mediaImportApi';
import {midiBytesFromBase64, parseMidiFile} from '../music/midiFileImport';

export function useMidiImport() {
  const [isImportingMidi, setIsImportingMidi] = useState(false);
  const [midiImportError, setMidiImportError] = useState<string | null>(null);

  const importMidiFile = useCallback(async (request?: AudioImportRequest) => {
    const bridge = getMediaImportBridge();
    if (!bridge?.importMidi) {
      setMidiImportError('MIDI import API is unavailable.');
      return;
    }

    setIsImportingMidi(true);
    setMidiImportError(null);
    try {
      const imported = request ? await bridge.importMidi(request) : await bridge.importMidi();
      if (!imported.ok) {
        if (!imported.canceled) {
          setMidiImportError(imported.error);
        }
        return;
      }

      const tracks = parseMidiFile(midiBytesFromBase64(imported.base64));
      if (!importMidiTracksAtPlayhead(tracks, imported.name)) {
        setMidiImportError('MIDI file has no note data to import.');
      }
    } catch (error) {
      setMidiImportError(error instanceof Error ? error.message : 'MIDI import failed.');
    } finally {
      setIsImportingMidi(false);
    }
  }, []);

  return {importMidiFile, isImportingMidi, midiImportError};
}
