import {parseApcSourceFiles} from '../src/arrangement/apc';
import {APC_SOURCE_FORMAT, APC_SOURCE_VERSION} from '../src/arrangement/apc/apcSourceTypes';

// Minimal well-formed file set — parse only reads the singletons + entity dirs, so
// empty project/timeline objects are enough to exercise the manifest format/version gate.
function fileSet(manifest: Record<string, unknown>) {
  return [
    {relativePath: 'manifest.json', content: JSON.stringify(manifest)},
    {relativePath: 'project.json', content: '{}'},
    {relativePath: 'timeline.json', content: '{}'},
  ];
}

const validManifest = {
  format: APC_SOURCE_FORMAT,
  version: APC_SOURCE_VERSION,
  savedAt: '1970-01-01T00:00:00.000Z',
  trackIds: [],
  clipIds: [],
  patternIds: [],
  fxTrackIds: [],
};

describe('parseApcSourceFiles manifest gate', () => {
  it('accepts a manifest with the expected format and version', () => {
    expect(parseApcSourceFiles(fileSet(validManifest)).ok).toBe(true);
  });

  it('rejects a foreign / unrecognized format', () => {
    const result = parseApcSourceFiles(fileSet({...validManifest, format: 'ai-producer-core.project'}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/format/i);
    }
  });

  it('rejects a manifest with no format field', () => {
    const {format: _omit, ...noFormat} = validManifest;
    expect(parseApcSourceFiles(fileSet(noFormat)).ok).toBe(false);
  });

  it('rejects an unsupported future version', () => {
    const result = parseApcSourceFiles(fileSet({...validManifest, version: APC_SOURCE_VERSION + 1}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/version/i);
    }
  });

  it('rejects a per-entity file whose path does not match its content id', () => {
    const files = [
      ...fileSet(validManifest),
      // File lives at tracks/track-a.json but its content declares a different id —
      // the redirection vector the lock check / manifest would otherwise be fooled by.
      {relativePath: 'tracks/track-a.json', content: JSON.stringify({id: 'track-DIFFERENT'})},
    ];
    const result = parseApcSourceFiles(files);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/does not match its id/i);
    }
  });
});
