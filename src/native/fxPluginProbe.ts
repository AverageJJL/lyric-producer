import {sendNativeAudioCommand} from './NativeAudioEngine';
import type {FxPluginScanCandidate, FxPluginScanFormat} from './fxPluginCatalog';

export type FxPluginProbeDescription = {
  name: string;
  descriptiveName: string;
  formatName: string;
  category: string;
  manufacturerName: string;
  version: string;
  fileOrIdentifier: string;
  identifier: string;
  uniqueId: number;
  isInstrument: boolean;
  inputChannels: number;
  outputChannels: number;
  hasARAExtension: boolean;
};

export type FxPluginProbeResult =
  | {
      ok: true;
      probeVersion: number;
      externalPluginHosting: 'disabled' | 'enabled';
      format: FxPluginScanFormat;
      path: string;
      descriptionCount: number;
      descriptions: FxPluginProbeDescription[];
      instantiated: boolean;
    }
  | {ok: false; code: string; message: string};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function format(value: unknown): FxPluginScanFormat {
  return value === 'external_au' ? 'external_au' : 'external_vst3';
}

function description(value: unknown): FxPluginProbeDescription | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as Partial<FxPluginProbeDescription>;
  return {
    name: text(item.name),
    descriptiveName: text(item.descriptiveName),
    formatName: text(item.formatName),
    category: text(item.category),
    manufacturerName: text(item.manufacturerName),
    version: text(item.version),
    fileOrIdentifier: text(item.fileOrIdentifier),
    identifier: text(item.identifier),
    uniqueId: typeof item.uniqueId === 'number' ? item.uniqueId : 0,
    isInstrument: item.isInstrument === true,
    inputChannels: typeof item.inputChannels === 'number' ? item.inputChannels : 0,
    outputChannels: typeof item.outputChannels === 'number' ? item.outputChannels : 0,
    hasARAExtension: item.hasARAExtension === true,
  };
}

export function probeFxPlugin(candidate: FxPluginScanCandidate): FxPluginProbeResult {
  const response = sendNativeAudioCommand('probe_fx_plugin', {
    path: candidate.path,
    format: candidate.format,
    instantiate: false,
  });
  if (!response) {
    return {ok: false, code: 'native_unavailable', message: 'Native plugin probe is unavailable.'};
  }
  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: Record<string, unknown>; error?: {code?: string; message?: string}};
    if (!parsed.ok) {
      return {
        ok: false,
        code: text(parsed.error?.code) || 'plugin_probe_failed',
        message: text(parsed.error?.message) || 'Plugin probe failed.',
      };
    }
    const data = parsed.data ?? {};
    const descriptions = Array.isArray(data.descriptions)
      ? data.descriptions.map(description).filter((item): item is FxPluginProbeDescription => Boolean(item))
      : [];
    return {
      ok: true,
      probeVersion: typeof data.probeVersion === 'number' ? data.probeVersion : 1,
      externalPluginHosting: data.externalPluginHosting === 'enabled' ? 'enabled' : 'disabled',
      format: format(data.format),
      path: text(data.path) || candidate.path,
      descriptionCount: typeof data.descriptionCount === 'number' ? data.descriptionCount : descriptions.length,
      descriptions,
      instantiated: data.instantiated === true,
    };
  } catch {
    return {ok: false, code: 'invalid_native_response', message: 'Plugin probe returned malformed JSON.'};
  }
}
