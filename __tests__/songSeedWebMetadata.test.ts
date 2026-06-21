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
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('You can only return valid JSON.');
    expect(body.messages[0].content).toContain('Do not include prose, Markdown, code fences');
    expect(body.messages[0].content).toContain('Example output: {"title":"Umbrella","artist":"Rihanna","bpm":87,"key":"Bb minor"');
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

  it('accepts unicode key symbols and URL string sources', async () => {
    await expect(lookupOpenRouterWebBpmKey(
      {title: 'Umbrella', artist: 'Rihanna'},
      {OPENROUTER_API_KEY: 'openrouter'},
      jest.fn(() => okJson({
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'Umbrella',
              artist: 'Rihanna',
              bpm: 87,
              key: 'C♯ major',
              confidence: 0.95,
              sources: ['https://songbpm.com/@rihanna/umbrella'],
            }),
          },
        }],
      })) as typeof fetch,
    )).resolves.toEqual({
      ok: true,
      candidate: expect.objectContaining({
        bpm: 87,
        key: 'C# major',
        sources: [{url: 'https://songbpm.com/@rihanna/umbrella'}],
      }),
    });
  });

  it('accepts BPM text and spelled accidentals', async () => {
    await expect(lookupOpenRouterWebBpmKey(
      {title: 'Umbrella', artist: 'Rihanna'},
      {OPENROUTER_API_KEY: 'openrouter'},
      jest.fn(() => okJson({
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'Umbrella',
              artist: 'Rihanna',
              bpm: '87 BPM',
              key: 'C-sharp major',
              confidence: 0.91,
              sources: [{url: 'https://tunebat.com/Info/Umbrella-Rihanna-JAY-Z'}],
            }),
          },
        }],
      })) as typeof fetch,
    )).resolves.toEqual({
      ok: true,
      candidate: expect.objectContaining({
        bpm: 87,
        key: 'C# major',
        sources: [{url: 'https://tunebat.com/Info/Umbrella-Rihanna-JAY-Z'}],
      }),
    });
  });

  it('uses the requested song object from a fenced JSON array', async () => {
    await expect(lookupOpenRouterWebBpmKey(
      {title: 'Umbrella', artist: 'Rihanna'},
      {OPENROUTER_API_KEY: 'openrouter'},
      jest.fn(() => okJson({
        choices: [{
          message: {
            content: [
              'Here is the data:',
              '```json',
              '[',
              `${JSON.stringify({title: "Don't Stop The Music", artist: 'Rihanna', bpm: 123, key: 'F# minor', confidence: 0.95, sources: [{url: 'https://example.com/wrong'}]})},`,
              '{"title":"Umbrella","artist":"Rihanna","bpm":87,"key":"C# major","confidence":0.9,"sources":[{"url":"https://example.com/umbrella"}]}',
              ']',
              '```',
            ].join('\n'),
          },
        }],
      })) as typeof fetch,
    )).resolves.toEqual({
      ok: true,
      candidate: expect.objectContaining({
        title: 'Umbrella',
        bpm: 87,
        key: 'C# major',
        sources: [{url: 'https://example.com/umbrella'}],
      }),
    });
  });

  it('rejects a valid-looking object for the wrong song', async () => {
    await expect(lookupOpenRouterWebBpmKey(
      {title: 'Umbrella', artist: 'Rihanna'},
      {OPENROUTER_API_KEY: 'openrouter'},
      jest.fn(() => okJson({
        choices: [{
          message: {
            content: JSON.stringify({title: "Don't Stop The Music", artist: 'Rihanna', bpm: 123, key: 'F# minor', confidence: 0.95, sources: [{url: 'https://example.com/wrong'}]}),
          },
        }],
      })) as typeof fetch,
    )).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('response did not match requested song'),
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
    )).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('Raw OpenRouter output:'),
    });
  });

  it('returns false on network failures', async () => {
    await expect(lookupOpenRouterWebBpmKey(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {OPENROUTER_API_KEY: 'openrouter'},
      jest.fn(() => failed(500)) as typeof fetch,
    )).resolves.toMatchObject({ok: false});
  });
});
