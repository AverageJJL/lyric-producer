import type {CopilotDrumPatternOption} from './copilotDrumPatternOptions';

export const COPILOT_DRUM_PATTERN_DRAG_TYPE = 'application/x-copilot-drum-pattern-option';

export function encodeCopilotDrumPatternDrag(option: CopilotDrumPatternOption): string {
  return JSON.stringify({option});
}

export function decodeCopilotDrumPatternDrag(value: string): CopilotDrumPatternOption | null {
  try {
    const parsed = JSON.parse(value) as {option?: CopilotDrumPatternOption};
    return parsed.option ?? null;
  } catch {
    return null;
  }
}
