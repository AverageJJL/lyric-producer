import {
  clearAutosaveDraft,
  loadRecentProjects,
  readAutosaveDraft,
  rememberRecentProject,
  writeAutosaveDraft,
} from '../src/arrangement/projectLifecycleStorage';
import {
  decomposeSnapshotToApcSource,
  serializeApcSource,
} from '../src/arrangement/apc';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';

const TS = '2026-01-01T00:00:00.000Z';

describe('project lifecycle storage', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = window.localStorage;
    storage.clear();
  });

  it('keeps recent projects unique with the newest first', () => {
    rememberRecentProject('/tmp/a.apc', storage);
    rememberRecentProject('/tmp/b.apc', storage);
    rememberRecentProject('/tmp/a.apc', storage);

    expect(loadRecentProjects(storage)).toEqual([
      '/tmp/a.apc',
      '/tmp/b.apc',
    ]);
  });

  it('round-trips autosave drafts', () => {
    const files = serializeApcSource(
      decomposeSnapshotToApcSource(captureProjectSnapshot(), TS),
    );

    writeAutosaveDraft(
      {
        path: '/tmp/song.apc',
        files,
        savedFingerprint: 'abc',
        savedAt: '2026-06-02T12:00:00.000Z',
      },
      storage,
    );

    expect(readAutosaveDraft(storage)).toMatchObject({
      path: '/tmp/song.apc',
      files,
      savedFingerprint: 'abc',
    });

    clearAutosaveDraft(storage);
    expect(readAutosaveDraft(storage)).toBeNull();
  });

  it('rejects autosave drafts missing the .apc source files array', () => {
    storage.setItem(
      'aiProducerCore.autosaveDraft',
      JSON.stringify({
        path: '/tmp/song.apc',
        savedFingerprint: 'abc',
        savedAt: '2026-06-02T12:00:00.000Z',
      }),
    );

    expect(readAutosaveDraft(storage)).toBeNull();
  });
});
