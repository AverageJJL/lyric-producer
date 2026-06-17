import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

describe('Electron update feed configuration', () => {
  it('keeps release metadata wired to a generic update feed', () => {
    const {build} = packageJson;

    expect(build).toMatchObject({
      electronUpdaterCompatibility: '>=2.16',
      detectUpdateChannel: true,
      generateUpdatesFilesForAllChannels: true,
      publish: [
        {
          provider: 'generic',
          url: '${env.AI_PRODUCER_UPDATE_FEED_URL}',
          channel: 'latest',
          publishAutoUpdate: true,
        },
      ],
    });
    expect(packageJson.dependencies['electron-updater']).toMatch(/^\^6\./);
  });
});
