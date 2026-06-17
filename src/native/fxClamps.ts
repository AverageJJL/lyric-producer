/** UI clamps for normalized Airwindows parameters (0..1). */

import {mergePluginValues} from '../music/fxPluginMetadata';
import type {FxSlotId, PluginFxParams} from './fxContract';

export const FX_PARAM_MIN = 0;
export const FX_PARAM_MAX = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampPluginValues(
  slotId: FxSlotId,
  params: PluginFxParams,
): PluginFxParams {
  const merged = mergePluginValues(slotId, params.values);
  const values: Record<string, number> = {};
  for (const [key, raw] of Object.entries(merged)) {
    values[key] = clamp(raw, FX_PARAM_MIN, FX_PARAM_MAX);
  }
  return {pluginId: params.pluginId, values};
}
