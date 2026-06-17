import {probeFxPlugin} from '../src/native/fxPluginProbe';
import type {FxPluginScanCandidate} from '../src/native/fxPluginCatalog';

const candidate: FxPluginScanCandidate = {
  pluginId: 'external_vst3:/plugins/Shape.vst3',
  displayName: 'Shape',
  format: 'external_vst3',
  path: '/plugins/Shape.vst3',
  status: 'disabled',
};

describe('fxPluginProbe', () => {
  beforeEach(() => {
    window.audioEngine = undefined;
  });

  it('returns a native-unavailable probe result when the bridge is absent', () => {
    expect(probeFxPlugin(candidate)).toEqual({
      ok: false,
      code: 'native_unavailable',
      message: 'Native plugin probe is unavailable.',
    });
  });

  it('parses native probe metadata', () => {
    const sendCommand = jest.fn(() =>
      JSON.stringify({
        ok: true,
        data: {
          probeVersion: 1,
          externalPluginHosting: 'enabled',
          format: 'external_vst3',
          path: '/plugins/Shape.vst3',
          descriptionCount: 1,
          instantiated: false,
          descriptions: [{
            name: 'Shape',
            descriptiveName: 'Shape Stereo',
            formatName: 'VST3',
            manufacturerName: 'Acme',
            inputChannels: 2,
            outputChannels: 2,
            isInstrument: false,
          }],
        },
      }),
    );
    window.audioEngine = {sendCommand};

    const result = probeFxPlugin(candidate);

    expect(sendCommand).toHaveBeenCalledWith(
      'probe_fx_plugin',
      JSON.stringify({path: '/plugins/Shape.vst3', format: 'external_vst3', instantiate: false}),
    );
    expect(result).toMatchObject({
      ok: true,
      externalPluginHosting: 'enabled',
      descriptionCount: 1,
      descriptions: [{name: 'Shape', manufacturerName: 'Acme'}],
    });
  });

  it('preserves native probe errors', () => {
    window.audioEngine = {
      sendCommand: jest.fn(() =>
        JSON.stringify({
          ok: false,
          error: {code: 'external_plugin_hosting_disabled', message: 'External VST3 plugin hosting is disabled.'},
        }),
      ),
    };

    expect(probeFxPlugin(candidate)).toEqual({
      ok: false,
      code: 'external_plugin_hosting_disabled',
      message: 'External VST3 plugin hosting is disabled.',
    });
  });
});
