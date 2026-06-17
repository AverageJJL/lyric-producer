import {
  clearAutosaveDraft,
  loadRecentProjects,
  readAutosaveDraft,
  rememberRecentProject,
  writeAutosaveDraft,
} from '../src/arrangement/projectLifecycleStorage';

describe('project lifecycle storage', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = window.localStorage;
    storage.clear();
  });

  it('keeps recent projects unique with the newest first', () => {
    rememberRecentProject('/tmp/a.apcproject', storage);
    rememberRecentProject('/tmp/b.apcproject', storage);
    rememberRecentProject('/tmp/a.apcproject', storage);

    expect(loadRecentProjects(storage)).toEqual([
      '/tmp/a.apcproject',
      '/tmp/b.apcproject',
    ]);
  });

  it('round-trips autosave drafts', () => {
    writeAutosaveDraft(
      {
        path: '/tmp/song.apcproject',
        content: '{"ok":true}',
        savedFingerprint: 'abc',
        savedAt: '2026-06-02T12:00:00.000Z',
      },
      storage,
    );

    expect(readAutosaveDraft(storage)).toMatchObject({
      path: '/tmp/song.apcproject',
      savedFingerprint: 'abc',
    });

    clearAutosaveDraft(storage);
    expect(readAutosaveDraft(storage)).toBeNull();
  });
});
