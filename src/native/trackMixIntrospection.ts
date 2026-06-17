import {sendNativeAudioCommand} from './NativeAudioEngine';

export type NativeTrackRoutingSend = {
  targetTrackId: string;
  gainDb: number;
  preFader: boolean;
};

export type NativeAuxSend = {
  busNumber: number;
  targetTrackId: string;
  gainDb: number;
  muted: boolean;
  preFader: boolean;
};

export type NativeSidechainPlugin = {
  pluginName: string;
  pluginType: string;
  sourceTrackId: string;
  wireCount: number;
  canSidechain: boolean;
};

export type NativeTrackAutomationLane = {
  targetType: string;
  parameterId: string;
  pointCount: number;
  evaluatedValue: number;
};

export type NativeTrackAutomationCurve = {
  parameterId: string;
  pointCount: number;
  bypassed: boolean;
  firstBeat: number;
  firstValue: number;
  lastBeat: number;
  lastValue: number;
};

export type NativeTrackMixRecord = {
  id: string;
  name: string;
  type: string;
  isMuted: boolean;
  isSolo: boolean;
  isInputMonitoringEnabled: boolean;
  isFrozen: boolean;
  trackFolderName: string;
  trackGroupName: string;
  automationMode: string;
  automationReadActive: boolean;
  automationLaneCount: number;
  automationEvaluationBeat: number;
  automationLanes: NativeTrackAutomationLane[];
  automationAppliedFaderDb: number;
  automationAppliedPan: number;
  nativeAutomationCurveCount: number;
  nativeAutomationCurves: NativeTrackAutomationCurve[];
  volumeDb: number;
  pan: number;
  gainDb: number;
  effectiveVolumeDb: number;
  nativeGainTrimDb: number;
  nativeFaderDb: number;
  nativeEffectiveVolumeDb: number;
  routingRole: string;
  routingOutputTrackId: string;
  nativeRoutingOutputTrackId: string;
  routingSendCount: number;
  routingSends: NativeTrackRoutingSend[];
  nativeAuxSendCount: number;
  nativeAuxSends: NativeAuxSend[];
  nativeAuxReturnBusNumber: number;
  routingSidechainSourceTrackId: string;
  nativeSidechainPluginCount: number;
  nativeSidechainPlugins: NativeSidechainPlugin[];
  gainStageMode: string;
  channelStrip: {
    inputGainDb: number;
    faderVolumeDb: number;
    pan: number;
    postFaderEffectiveDb: number;
  };
};

export type NativeTrackMixSnapshot = {
  channelStripVersion: number;
  gainStageMode: string;
  automationEvaluationBeat: number;
  tracks: NativeTrackMixRecord[];
  master: {
    volumeDb: number;
    pan: number;
  };
};

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRoutingSend(value: unknown): value is NativeTrackRoutingSend {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const send = value as Partial<NativeTrackRoutingSend>;
  return (
    typeof send.targetTrackId === 'string' &&
    isNumber(send.gainDb) &&
    typeof send.preFader === 'boolean'
  );
}

function isNativeAuxSend(value: unknown): value is NativeAuxSend {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const send = value as Partial<NativeAuxSend>;
  return (
    isNumber(send.busNumber) &&
    typeof send.targetTrackId === 'string' &&
    isNumber(send.gainDb) &&
    typeof send.muted === 'boolean' &&
    typeof send.preFader === 'boolean'
  );
}

function isNativeSidechainPlugin(value: unknown): value is NativeSidechainPlugin {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const plugin = value as Partial<NativeSidechainPlugin>;
  return (
    typeof plugin.pluginName === 'string' &&
    typeof plugin.pluginType === 'string' &&
    typeof plugin.sourceTrackId === 'string' &&
    isNumber(plugin.wireCount) &&
    typeof plugin.canSidechain === 'boolean'
  );
}

function isAutomationLane(value: unknown): value is NativeTrackAutomationLane {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const lane = value as Partial<NativeTrackAutomationLane>;
  return (
    typeof lane.targetType === 'string' &&
    typeof lane.parameterId === 'string' &&
    isNumber(lane.pointCount) &&
    isNumber(lane.evaluatedValue)
  );
}

function isAutomationCurve(value: unknown): value is NativeTrackAutomationCurve {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const curve = value as Partial<NativeTrackAutomationCurve>;
  return (
    typeof curve.parameterId === 'string' &&
    isNumber(curve.pointCount) &&
    typeof curve.bypassed === 'boolean' &&
    isNumber(curve.firstBeat) &&
    isNumber(curve.firstValue) &&
    isNumber(curve.lastBeat) &&
    isNumber(curve.lastValue)
  );
}

function isTrackMixRecord(value: unknown): value is NativeTrackMixRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const track = value as Partial<NativeTrackMixRecord>;
  const channelStrip = track.channelStrip;
  return (
    typeof track.id === 'string' &&
    typeof track.name === 'string' &&
    typeof track.type === 'string' &&
    typeof track.isMuted === 'boolean' &&
    typeof track.isSolo === 'boolean' &&
    typeof track.isInputMonitoringEnabled === 'boolean' &&
    typeof track.isFrozen === 'boolean' &&
    typeof track.trackFolderName === 'string' &&
    typeof track.trackGroupName === 'string' &&
    typeof track.automationMode === 'string' &&
    typeof track.automationReadActive === 'boolean' &&
    isNumber(track.automationLaneCount) &&
    isNumber(track.automationEvaluationBeat) &&
    Array.isArray(track.automationLanes) &&
    track.automationLanes.every(isAutomationLane) &&
    isNumber(track.automationAppliedFaderDb) &&
    isNumber(track.automationAppliedPan) &&
    isNumber(track.nativeAutomationCurveCount) &&
    Array.isArray(track.nativeAutomationCurves) &&
    track.nativeAutomationCurves.every(isAutomationCurve) &&
    isNumber(track.volumeDb) &&
    isNumber(track.pan) &&
    isNumber(track.gainDb) &&
    isNumber(track.effectiveVolumeDb) &&
    isNumber(track.nativeGainTrimDb) &&
    isNumber(track.nativeFaderDb) &&
    isNumber(track.nativeEffectiveVolumeDb) &&
    typeof track.routingRole === 'string' &&
    typeof track.routingOutputTrackId === 'string' &&
    typeof track.nativeRoutingOutputTrackId === 'string' &&
    isNumber(track.routingSendCount) &&
    Array.isArray(track.routingSends) &&
    track.routingSends.every(isRoutingSend) &&
    isNumber(track.nativeAuxSendCount) &&
    Array.isArray(track.nativeAuxSends) &&
    track.nativeAuxSends.every(isNativeAuxSend) &&
    isNumber(track.nativeAuxReturnBusNumber) &&
    typeof track.routingSidechainSourceTrackId === 'string' &&
    isNumber(track.nativeSidechainPluginCount) &&
    Array.isArray(track.nativeSidechainPlugins) &&
    track.nativeSidechainPlugins.every(isNativeSidechainPlugin) &&
    typeof track.gainStageMode === 'string' &&
    track.gainStageMode === 'separate_gain_trim' &&
    Boolean(channelStrip) &&
    isNumber(channelStrip?.inputGainDb) &&
    isNumber(channelStrip?.faderVolumeDb) &&
    isNumber(channelStrip?.pan) &&
    isNumber(channelStrip?.postFaderEffectiveDb)
  );
}

function isTrackMixSnapshot(value: unknown): value is NativeTrackMixSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const snapshot = value as Partial<NativeTrackMixSnapshot>;
  return (
    snapshot.channelStripVersion === 6 &&
    snapshot.gainStageMode === 'separate_gain_trim' &&
    isNumber(snapshot.automationEvaluationBeat) &&
    Array.isArray(snapshot.tracks) &&
    snapshot.tracks.every(isTrackMixRecord) &&
    Boolean(snapshot.master) &&
    isNumber(snapshot.master?.volumeDb) &&
    isNumber(snapshot.master?.pan)
  );
}

export function getNativeTrackMixSnapshot(
  trackId?: string,
): NativeTrackMixSnapshot | null {
  const payload = trackId ? {trackId} : {};
  const response = sendNativeAudioCommand('get_track_mix', payload);
  if (!response) {
    return null;
  }

  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: unknown};
    if (parsed.ok && isTrackMixSnapshot(parsed.data)) {
      return parsed.data;
    }
  } catch {
    return null;
  }

  return null;
}
