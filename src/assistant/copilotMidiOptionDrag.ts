import type {CopilotMidiOption} from './copilotMidiOptions';

export const COPILOT_MIDI_OPTION_DRAG_TYPE = 'application/x-copilot-midi-option';

export function encodeCopilotMidiOptionDrag(option: CopilotMidiOption): string {
  return JSON.stringify({option});
}

export function decodeCopilotMidiOptionDrag(value: string): CopilotMidiOption | null {
  try {
    const parsed = JSON.parse(value) as {option?: CopilotMidiOption};
    return parsed.option ?? null;
  } catch {
    return null;
  }
}
