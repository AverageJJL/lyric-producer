import {drumStepFromClipBeat} from '../src/music/drumPattern';

describe('drumStepFromClipBeat', () => {
  it('quantizes beat offsets to 16th steps', () => {
    expect(drumStepFromClipBeat(0)).toBe(0);
    expect(drumStepFromClipBeat(0.24)).toBe(0);
    expect(drumStepFromClipBeat(0.25)).toBe(1);
    expect(drumStepFromClipBeat(1)).toBe(4);
  });
});
