import {lookupOpenRouterWebBpmKey} from '../electron/songSeedWebMetadata';

function okJson(payload: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  } as Response);
}

function failed(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  } as Response);
}

describe('OpenRouter web metadata fallback', () => {
  it('accepts sourced BPM and key JSON', async () => {
    const fetchMock = jest.fn(() => okJson({
      choices: [{
        message: {
          content: JSON.stringify({
            title: 'Blank Space',
            artist: 'Taylor Swift',
            bpm: 96,
            key: 'F major',
            confidence: 0.9,
            sources: [{title: 'SongBPM', url: 'https://songbpm.com/blank-space'}],
          }),
        },
      }],
    }));

    await expect(lookupOpenRouterWebBpmKey(
      {title: 'Blank Space', artist: 'Taylor Swift'},
      {OPENROUTER_API_KEY: 'openrouter'},
      fetchMock as typeof fetch,
    )).resolves.toEqual({
      ok: true,
      candidate: expect.objectContaining({
        bpm: 96,
        key: 'F major',
        source: 'openrouter-web',
        confidence: 0.9,
        sources: [{title: 'SongBPM', url: 'https://songbpm.com/blank-space'}],
      }),
    });
  });

  it('uses OpenRouter annotations as citations when JSON omits sources', async () => {
    await expect(lookupOpenRouterWebBpmKey(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {OPENROUTER_API_KEY: 'openrouter'},
      jest.fn(() => okJson({
        choices: [{
          message: {
            content: '{"bpm":120,"key":"A minor","confidence":0.72}',
            annotations: [{
              url_citation: {
                title: 'Metadata page',
                url: 'https://example.com/dreams',
              },
            }],
          },
        }],
      })) as typeof fetch,
    )).resolves.toEqual({
      ok: true,
      candidate: expect.objectContaining({
        bpm: 120,
        key: 'A minor',
        sources: [{title: 'Metadata page', url: 'https://example.com/dreams'}],
      }),
    });
  });

  it('rejects malformed JSON', async () => {
    await expect(lookupOpenRouterWebBpmKey(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {OPENROUTER_API_KEY: 'openrouter'},
      jest.fn(() => okJson({choices: [{message: {content: 'tempo is 120'}}]})) as typeof fetch,
    )).resolves.toMatchObject({ok: false});
  });

  it('rejects missing citations', async () => {
    await expect(lookupOpenRouterWebBpmKey(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {OPENROUTER_API_KEY: 'openrouter'},
      jest.fn(() => okJson({
        choices: [{message: {content: '{"bpm":120,"key":"A minor","confidence":0.8,"sources":[]}'}}],
      })) as typeof fetch,
    )).resolves.toMatchObject({ok: false});
  });

  it('rejects invalid BPM and key values', async () => {
    await expect(lookupOpenRouterWebBpmKey(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {OPENROUTER_API_KEY: 'openrouter'},
      jest.fn(() => okJson({
        choices: [{
          message: {
            content: '{"bpm":300,"key":"H major","confidence":0.9,"sources":[{"url":"https://example.com"}]}',
          },
        }],
      })) as typeof fetch,
    )).resolves.toMatchObject({ok: false});
  });

  it('returns false on network failures', async () => {
    await expect(lookupOpenRouterWebBpmKey(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {OPENROUTER_API_KEY: 'openrouter'},
      jest.fn(() => failed(500)) as typeof fetch,
    )).resolves.toMatchObject({ok: false});
  });
});
