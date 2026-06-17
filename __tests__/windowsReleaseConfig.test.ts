import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

describe('Windows release configuration', () => {
  it('keeps the Electron Windows release wired for signed NSIS builds', () => {
    const {win} = packageJson.build;

    expect(win).toMatchObject({
      target: 'nsis',
      verifyUpdateCodeSignature: true,
      requestedExecutionLevel: 'asInvoker',
      signAndEditExecutable: true,
      signtoolOptions: {
        signingHashAlgorithms: ['sha256'],
        rfc3161TimeStampServer: 'http://timestamp.digicert.com',
      },
    });
    expect(win.azureSignOptions).toBeUndefined();
  });
});
