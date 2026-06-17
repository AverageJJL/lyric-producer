import type {FxSlotId, PluginHostStatus} from './fxContract';
import {sendNativeAudioCommand} from './NativeAudioEngine';
import type {FxPluginProbeDescription} from './fxPluginProbe';
import type {FxPluginScanCandidate, FxPluginScanFormat} from './fxPluginCatalog';

export type FxPluginInsertValidationResult =
  | {
      ok: true;
      insertValidationVersion: number;
      trackId: string;
      slot: FxSlotId;
      candidate: FxPluginScanCandidate;
      externalPluginHosting: 'disabled' | 'enabled';
      canInsert: boolean;
      requiresProbe: boolean;
      status: PluginHostStatus;
      reason: string;
      recoveryHint?: string;
      description?: FxPluginProbeDescription;
    }
  | {ok: false; code: string; message: string};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function format(value: unknown): FxPluginScanFormat {
  return value === 'external_au' ? 'external_au' : 'external_vst3';
}

function status(value: unknown): PluginHostStatus {
  if (value === 'missing' || value === 'disabled') {
    return value;
  }
  return 'available';
}

function description(value: unknown): FxPluginProbeDescription | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
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

export function validateFxPluginInsert(
  trackId: string,
  slot: FxSlotId,
  candidate: FxPluginScanCandidate,
): FxPluginInsertValidationResult {
  const response = sendNativeAudioCommand('validate_fx_plugin_insert', {trackId, slot, candidate});
  if (!response) {
    return {ok: false, code: 'native_unavailable', message: 'Native plugin insert validation is unavailable.'};
  }

  try {
    const parsed = JSON.parse(response) as {
      ok?: boolean;
      data?: Record<string, unknown>;
      error?: {code?: string; message?: string};
    };
    if (!parsed.ok) {
      return {
        ok: false,
        code: text(parsed.error?.code) || 'plugin_insert_validation_failed',
        message: text(parsed.error?.message) || 'Plugin insert validation failed.',
      };
    }

    const data = parsed.data ?? {};
    return {
      ok: true,
      insertValidationVersion: typeof data.insertValidationVersion === 'number'
        ? data.insertValidationVersion
        : 1,
      trackId: text(data.trackId) || trackId,
      slot,
      candidate: {
        pluginId: text((data.candidate as Partial<FxPluginScanCandidate> | undefined)?.pluginId)
          || candidate.pluginId,
        displayName: text((data.candidate as Partial<FxPluginScanCandidate> | undefined)?.displayName)
          || candidate.displayName,
        format: format((data.candidate as Partial<FxPluginScanCandidate> | undefined)?.format),
        path: text((data.candidate as Partial<FxPluginScanCandidate> | undefined)?.path) || candidate.path,
        status: status(data.status),
        recoveryHint: text(data.recoveryHint) || candidate.recoveryHint,
      },
      externalPluginHosting: data.externalPluginHosting === 'enabled' ? 'enabled' : 'disabled',
      canInsert: data.canInsert === true,
      requiresProbe: data.requiresProbe === true,
      status: status(data.status),
      reason: text(data.reason) || 'unknown',
      recoveryHint: text(data.recoveryHint) || undefined,
      description: description(data.description),
    };
  } catch {
    return {ok: false, code: 'invalid_native_response', message: 'Plugin insert validation returned malformed JSON.'};
  }
}
