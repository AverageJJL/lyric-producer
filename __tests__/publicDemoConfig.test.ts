import {readPublicDemoConfig, songSeedEnvForPublicDemo} from '../electron/publicDemoConfig';

describe('public demo config', () => {
  it('routes song seed providers through public demo proxies without exposing real keys', () => {
    const config = readPublicDemoConfig(undefined, {
      AI_PRODUCER_PUBLIC_DEMO: '1',
      AI_PRODUCER_DEMO_PROXY_BASE_URL: 'https://demo.example/api/openrouter',
      AI_PRODUCER_DEMO_MUSIXMATCH_PROXY_BASE_URL: 'https://demo.example/api/musixmatch',
      AI_PRODUCER_DEMO_PUBLIC_TOKEN: 'public-token',
      AI_PRODUCER_DEMO_DISABLE_SONG_SEED_PROVIDERS: '0',
    });

    expect(songSeedEnvForPublicDemo({
      MUSIXMATCH_API_KEY: 'real-mxm',
      GETSONGBPM_API_KEY: 'real-bpm',
      OPENROUTER_API_KEY: 'real-openrouter',
    }, config)).toMatchObject({
      MUSIXMATCH_API_KEY: 'public-token',
      MUSIXMATCH_API_BASE_URL: 'https://demo.example/api/musixmatch',
      OPENROUTER_API_KEY: 'public-token',
      AI_PRODUCER_API_BASE_URL: 'https://demo.example/api/openrouter',
    });
  });

  it('still removes Musixmatch when live song seed providers are disabled', () => {
    const config = readPublicDemoConfig(undefined, {
      AI_PRODUCER_PUBLIC_DEMO: '1',
      AI_PRODUCER_DEMO_DISABLE_SONG_SEED_PROVIDERS: '1',
      AI_PRODUCER_DEMO_MUSIXMATCH_PROXY_BASE_URL: 'https://demo.example/api/musixmatch',
    });

    expect(songSeedEnvForPublicDemo({MUSIXMATCH_API_KEY: 'real'}, config)).not.toHaveProperty('MUSIXMATCH_API_KEY');
  });
});
