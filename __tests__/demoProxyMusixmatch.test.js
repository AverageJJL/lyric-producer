const {handleMusixmatchProxy, upstreamMusixmatchUrl} = require('../demo-proxy/openrouterProxy');

function response() {
  return {
    headers: {},
    statusCode: 200,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    json: jest.fn(),
    send: jest.fn(),
    end: jest.fn(),
  };
}

describe('Musixmatch demo proxy', () => {
  it('replaces the public token with the server-side Musixmatch key', async () => {
    const req = {
      method: 'GET',
      url: '/api/musixmatch/track.search?apikey=public-demo&q_track=halo&page_size=8',
      query: {method: 'track.search', apikey: 'public-demo'},
      headers: {},
      socket: {remoteAddress: '127.0.0.1'},
    };
    const res = response();
    const fetchMock = jest.fn(async () => ({
      status: 200,
      headers: {get: () => 'application/json'},
      text: async () => '{"ok":true}',
    }));

    await handleMusixmatchProxy(req, res, {
      DEMO_PROXY_TOKEN: 'public-demo',
      MUSIXMATCH_API_KEY: 'real-mxm-key',
    }, fetchMock);

    const upstream = String(fetchMock.mock.calls[0][0]);
    expect(upstream).toContain('/track.search?');
    expect(upstream).toContain('apikey=real-mxm-key');
    expect(upstream).toContain('q_track=halo');
    expect(upstream).not.toContain('public-demo');
    expect(res.statusCode).toBe(200);
    expect(res.send).toHaveBeenCalledWith('{"ok":true}');
  });

  it('blocks unsupported Musixmatch methods', async () => {
    const res = response();
    await handleMusixmatchProxy({
      method: 'GET',
      url: '/api/musixmatch/user.get?apikey=public-demo',
      query: {method: 'user.get', apikey: 'public-demo'},
      headers: {},
      socket: {remoteAddress: '127.0.0.1'},
    }, res, {DEMO_PROXY_TOKEN: 'public-demo', MUSIXMATCH_API_KEY: 'real-mxm-key'}, jest.fn());

    expect(res.json).toHaveBeenCalledWith({error: {message: 'Requested Musixmatch method is not allowed.'}});
    expect(res.statusCode).toBe(400);
  });

  it('builds upstream URLs without forwarding the demo token', () => {
    const upstream = upstreamMusixmatchUrl({
      url: '/api/musixmatch/track.lyrics.get?apikey=public-demo&track_id=42',
    }, 'track.lyrics.get', {
      MUSIXMATCH_API_KEY: 'real-mxm-key',
    });

    expect(String(upstream)).toBe('https://api.musixmatch.com/ws/1.1/track.lyrics.get?track_id=42&apikey=real-mxm-key');
  });
});
