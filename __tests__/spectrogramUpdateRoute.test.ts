import {applySpectrogramReadyPayload} from '../src/store/spectrogramUpdateRoute';

describe('spectrogramUpdateRoute', () => {
  it('applies successful ready event via store action', () => {
    const applySpectrogramReady = jest.fn();
    applySpectrogramReadyPayload(
      {requestId: 'spec-1', pngPath: 'spectrograms/clip-a.png', ok: true},
      {applySpectrogramReady},
    );
    expect(applySpectrogramReady).toHaveBeenCalledWith({
      requestId: 'spec-1',
      pngPath: 'spectrograms/clip-a.png',
      ok: true,
    });
  });

  it('ignores payloads without requestId', () => {
    const applySpectrogramReady = jest.fn();
    applySpectrogramReadyPayload(
      {requestId: '', pngPath: '', ok: false},
      {applySpectrogramReady},
    );
    expect(applySpectrogramReady).not.toHaveBeenCalled();
  });
});
