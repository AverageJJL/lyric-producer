import {
  matchOfflineMediaSources,
  walkOfflineRecoveryAudioFiles,
} from '../electron/offlineMediaRecoveryMatcher';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('offline media recovery matcher', () => {
  it('matches saved missing sources by basename across path styles', () => {
    const matches = matchOfflineMediaSources(
      [
        {
          sourceKey: 'relative:imports/Lead Vox.wav',
          sourcePath: 'imports/Lead Vox.wav',
          name: 'Lead Vox',
        },
        {
          sourceKey: 'absolute:C:\\Session\\Bass DI.aif',
          sourcePath: 'C:\\Session\\Bass DI.aif',
          name: 'Bass DI',
        },
        {
          sourceKey: 'missing:clip-pad',
          sourcePath: 'No source path',
          name: 'Pad Texture',
        },
      ],
      [
        '/Volumes/Drive/recovery/lead vox.wav',
        '/Volumes/Drive/recovery/Bass DI.aif',
        '/Volumes/Drive/recovery/Pad Texture.flac',
      ],
    );

    expect(matches.map(match => [match.source.sourceKey, match.absolutePath])).toEqual([
      ['relative:imports/Lead Vox.wav', '/Volumes/Drive/recovery/lead vox.wav'],
      ['absolute:C:\\Session\\Bass DI.aif', '/Volumes/Drive/recovery/Bass DI.aif'],
      ['missing:clip-pad', '/Volumes/Drive/recovery/Pad Texture.flac'],
    ]);
  });

  it('walks supported audio files and skips non-audio candidates', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'musicapp-offline-media-'));
    try {
      fs.writeFileSync(path.join(root, 'Loop.wav'), '');
      fs.writeFileSync(path.join(root, 'notes.txt'), '');

      expect(walkOfflineRecoveryAudioFiles(root)).toEqual([path.join(root, 'Loop.wav')]);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});
