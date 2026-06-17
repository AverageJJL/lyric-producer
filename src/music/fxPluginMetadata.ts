/**
 * UI metadata for pinned Airwindows rack plugins (mirrors shared_cpp/fx/AirwindowsFxCatalog.cpp).
 */

import type {FxSlotId} from '../native/fxContract';

export type FxParamMeta = {
  id: string;
  label: string;
  defaultValue: number;
};

export type FxSlotPluginMeta = {
  pluginId: string;
  displayName: string;
  params: FxParamMeta[];
};

export type FxParamGroup = {
  title: string;
  paramIds: string[];
};

/** Inspector layout groups per slot (hardware-style sections). */
export const FX_SLOT_PARAM_GROUPS: Record<FxSlotId, FxParamGroup[]> = {
  eq: [
    {title: 'Treble', paramIds: ['trFreq', 'treble', 'trReso']},
    {title: 'High Mid', paramIds: ['hmFreq', 'highMid', 'hmReso']},
    {title: 'Low Mid', paramIds: ['lmFreq', 'lowMid', 'lmReso']},
    {title: 'Mix', paramIds: ['dryWet']},
  ],
  compressor: [
    {title: 'Dynamics', paramIds: ['threshold', 'ratio', 'speed']},
    {title: 'Output', paramIds: ['makeupGain', 'dryWet']},
  ],
  reverb: [
    {title: 'Tone', paramIds: ['filter', 'damping', 'flavor']},
    {title: 'Space', paramIds: ['speed', 'vibrato', 'roomSize']},
    {title: 'Mix', paramIds: ['dryWet']},
  ],
};

export const FX_SLOT_PLUGINS: Record<FxSlotId, FxSlotPluginMeta> = {
  eq: {
    pluginId: 'airwindows:Parametric',
    displayName: 'Parametric',
    params: [
      {id: 'trFreq', label: 'Tr Freq', defaultValue: 0.5},
      {id: 'treble', label: 'Treble', defaultValue: 0.5},
      {id: 'trReso', label: 'Tr Reso', defaultValue: 0.5},
      {id: 'hmFreq', label: 'HM Freq', defaultValue: 0.5},
      {id: 'highMid', label: 'HighMid', defaultValue: 0.5},
      {id: 'hmReso', label: 'HM Reso', defaultValue: 0.5},
      {id: 'lmFreq', label: 'LM Freq', defaultValue: 0.5},
      {id: 'lowMid', label: 'LowMid', defaultValue: 0.5},
      {id: 'lmReso', label: 'LM Reso', defaultValue: 0.5},
      {id: 'dryWet', label: 'Dry/Wet', defaultValue: 1},
    ],
  },
  compressor: {
    pluginId: 'airwindows:Logical4',
    displayName: 'Logical4',
    params: [
      {id: 'threshold', label: 'Threshold', defaultValue: 0.5},
      {id: 'ratio', label: 'Ratio', defaultValue: 0.2},
      {id: 'speed', label: 'Speed', defaultValue: 0.192},
      {id: 'makeupGain', label: 'Makeup', defaultValue: 0.5},
      {id: 'dryWet', label: 'Dry/Wet', defaultValue: 1},
    ],
  },
  reverb: {
    pluginId: 'airwindows:MatrixVerb',
    displayName: 'MatrixVerb',
    params: [
      {id: 'filter', label: 'Filter', defaultValue: 0.5},
      {id: 'damping', label: 'Damping', defaultValue: 0.5},
      {id: 'speed', label: 'Speed', defaultValue: 0.5},
      {id: 'vibrato', label: 'Vibrato', defaultValue: 0.5},
      {id: 'roomSize', label: 'Room', defaultValue: 0.5},
      {id: 'flavor', label: 'Flavor', defaultValue: 0.5},
      {id: 'dryWet', label: 'Dry/Wet', defaultValue: 0.5},
    ],
  },
};

export function defaultPluginValues(slotId: FxSlotId): Record<string, number> {
  const meta = FX_SLOT_PLUGINS[slotId];
  return Object.fromEntries(meta.params.map(param => [param.id, param.defaultValue]));
}

export function mergePluginValues(
  slotId: FxSlotId,
  values: Record<string, number> | undefined,
): Record<string, number> {
  const defaults = defaultPluginValues(slotId);
  const meta = FX_SLOT_PLUGINS[slotId];
  const merged = {...defaults};
  if (!values) {
    return merged;
  }
  for (const param of meta.params) {
    if (typeof values[param.id] === 'number') {
      merged[param.id] = values[param.id];
    }
  }
  return merged;
}
