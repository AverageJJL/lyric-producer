import {projectScaleLabel} from '../src/store/projectMetadata';

describe('projectScaleLabel', () => {
  it('renders empty for the no-key default (null)', () => {
    expect(projectScaleLabel(null)).toBe('');
  });

  it('renders a real key as "<root> <Maj|Min>"', () => {
    expect(projectScaleLabel({root: 'A', mode: 'minor'})).toBe('A Min');
    expect(projectScaleLabel({root: 'C', mode: 'major'})).toBe('C Maj');
    expect(projectScaleLabel({root: 'F#', mode: 'minor'})).toBe('F# Min');
  });

  it('does not fabricate a key from a malformed scale value', () => {
    // A bad agent-supplied value (string, or wrong-shaped object) must read as "no key",
    // not silently become "C Maj" — otherwise an unapplied key edit looks applied.
    expect(projectScaleLabel('A minor' as unknown as never)).toBe('');
    expect(projectScaleLabel({mode: 'minor'} as unknown as never)).toBe('');
    expect(projectScaleLabel({root: '', mode: 'minor'} as never)).toBe('');
  });
});
