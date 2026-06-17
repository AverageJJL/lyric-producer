import {getFxPluginCatalog, scanFxPlugins} from '../src/native/fxPluginCatalog';

describe('fxPluginCatalog', () => {
  beforeEach(() => {
    window.audioEngine = undefined;
  });

  it('falls back to the managed Airwindows catalog when native is unavailable', () => {
    const catalog = getFxPluginCatalog();
    expect(catalog.externalPluginHosting).toBe('disabled');
    expect(catalog.plugins.map(plugin => plugin.pluginId)).toEqual([
      'airwindows:Parametric',
      'airwindows:Logical4',
      'airwindows:MatrixVerb',
    ]);
    expect(catalog.formats.find(format => format.format === 'external_vst3')).toMatchObject({
      enabled: false,
      reason: 'external_plugin_hosting_disabled',
    });
  });

  it('parses the native list_fx_plugins response', () => {
    const sendCommand = jest.fn(() =>
      JSON.stringify({
        ok: true,
        data: {
          catalogVersion: 2,
          externalPluginHosting: 'disabled',
          formats: [{format: 'builtin_airwindows', enabled: true}],
          plugins: [{
            slot: 'eq',
            pluginId: 'airwindows:Parametric',
            displayName: 'Parametric',
            format: 'builtin_airwindows',
            status: 'available',
            params: [{id: 'treble', label: 'Treble', defaultValue: 0.5}],
          }],
        },
      }),
    );
    window.audioEngine = {sendCommand};

    const catalog = getFxPluginCatalog();
    expect(sendCommand).toHaveBeenCalledWith('list_fx_plugins', JSON.stringify({}));
    expect(catalog.catalogVersion).toBe(2);
    expect(catalog.plugins).toHaveLength(1);
    expect(catalog.plugins[0]).toMatchObject({
      slot: 'eq',
      pluginId: 'airwindows:Parametric',
      displayName: 'Parametric',
    });
  });

  it('parses native external plugin scan metadata', () => {
    const sendCommand = jest.fn(() =>
      JSON.stringify({
        ok: true,
        data: {
          scanVersion: 1,
          externalPluginHosting: 'scan_metadata_only',
          defaultPathsUsed: false,
          recursive: true,
          truncated: false,
          scannedPaths: [
            {path: '/plugins', status: 'scanned'},
            {path: '/missing', status: 'missing'},
          ],
          formatCounts: {external_au: 1, external_vst3: 1},
          candidates: [
            {
              pluginId: 'external_vst3:/plugins/Shape.vst3',
              displayName: 'Shape',
              format: 'external_vst3',
              path: '/plugins/Shape.vst3',
              status: 'disabled',
              recoveryHint: 'External plugin binaries are discovered but not instantiated in this build.',
            },
            {
              pluginId: 'external_au:/plugins/Tone.component',
              displayName: 'Tone',
              format: 'external_au',
              path: '/plugins/Tone.component',
              status: 'disabled',
            },
          ],
        },
      }),
    );
    window.audioEngine = {sendCommand};

    const result = scanFxPlugins(['/plugins'], {formats: ['external_vst3'], recursive: false});

    expect(sendCommand).toHaveBeenCalledWith(
      'scan_fx_plugins',
      JSON.stringify({
        paths: ['/plugins'],
        formats: ['external_vst3'],
        recursive: false,
      }),
    );
    expect(result.scannedPaths).toEqual([
      {path: '/plugins', status: 'scanned', reason: undefined},
      {path: '/missing', status: 'missing', reason: undefined},
    ]);
    expect(result.formatCounts).toEqual({external_au: 1, external_vst3: 1});
    expect(result.defaultPathsUsed).toBe(false);
    expect(result.candidates.map(candidate => candidate.displayName)).toEqual(['Shape', 'Tone']);
    expect(result.candidates[0]).toMatchObject({
      format: 'external_vst3',
      status: 'disabled',
    });
  });
});
