import {isDrumPatternBlock} from '../music/clipFactories';
import {sendNativeAudioCommand} from './NativeAudioEngine';
import {syncTrackInstruments} from './syncTrackInstruments';
import {buildNativeMasterMixPayload} from './masterMixPayload';
import {buildNativeTracksPayload} from './trackPayload';
import {buildNativeLoopRangePayload} from './loopRangePayload';
import {buildNativeTempoMapPayload} from './tempoMapPayload';
import type {DAWBlock, DAWTrack} from '../store/useDAWStore';
import {useDAWStore} from '../store/useDAWStore';
import {shouldSyncFileAudioClip, upsertBlockToEngineAsync} from './blockSync';

function parseCommandData(response: string | null): Record<string, unknown> | null {
  if (!response) {
    return null;
  }
  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: Record<string, unknown>};
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function isHandsFreeDeviceName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes('hands-free') ||
    lower.includes('hands free') ||
    lower.includes('handsfree') ||
    lower.includes('ag audio') ||
    lower.includes('hfp')
  );
}

/** True when the engine reports a stereo-capable output (not BT HFP / transparency). */
function isStereoPlaybackHealthy(data: Record<string, unknown> | null): boolean {
  if (!data) {
    return false;
  }
  const deviceName = typeof data.deviceName === 'string' ? data.deviceName : '';
  const sampleRate = typeof data.sampleRate === 'number' ? data.sampleRate : 0;
  return (
    deviceName.length > 0 &&
    deviceName !== 'unavailable' &&
    !isHandsFreeDeviceName(deviceName) &&
    sampleRate >= 44100
  );
}

/** Output device open when voice capture starts — heal must reopen this, not OS default. */
let lockedPlaybackOutputDevice: string | null = null;

export function capturePlaybackOutputDevice(): string | null {
  const response = sendNativeAudioCommand('engine_status_fast', {});
  const deviceName = parseCommandData(response)?.deviceName;
  if (
    typeof deviceName === 'string' &&
    deviceName.length > 0 &&
    deviceName !== 'unavailable' &&
    !isHandsFreeDeviceName(deviceName)
  ) {
    lockedPlaybackOutputDevice = deviceName;
    return deviceName;
  }
  lockedPlaybackOutputDevice = null;
  return null;
}

function syncLoopRangeToEngine(): void {
  sendNativeAudioCommand('set_loop_range', buildNativeLoopRangePayload(useDAWStore.getState()));
}

export function syncTempoMapToEngine(): void {
  sendNativeAudioCommand('set_tempo_map', buildNativeTempoMapPayload(useDAWStore.getState()));
}

/** Mirror useDAWNativeBridge setTracks — heals track→audio-track mapping after mic capture. */
export function syncTracksToEngine(tracks: DAWTrack[]): void {
  sendNativeAudioCommand('setTracks', {
    tracks: buildNativeTracksPayload(tracks),
  });
  syncTrackInstruments(tracks);
}

export function syncMasterMixToEngine(): void {
  const state = useDAWStore.getState();
  sendNativeAudioCommand('set_master_mix', buildNativeMasterMixPayload(state));
}

export function upsertBlockForEngine(block: DAWBlock): void {
  upsertBlockToEngineAsync(block);
}

function syncFileBackedAudioClips(blocks: DAWBlock[]): void {
  blocks.forEach(block => {
    if (shouldSyncFileAudioClip(block)) {
      upsertBlockForEngine(block);
    }
  });
}

export type RefreshPlaybackOptions = {
  useSystemDefault?: boolean;
  outputDeviceName?: string;
  restoreStereoPlayback?: boolean;
  forceReopen?: boolean;
  syncArrangement?: boolean;
};

function runRefreshPlayback(options: RefreshPlaybackOptions): boolean {
  const useSystemDefault = options.useSystemDefault ?? false;
  const outputDeviceName = options.outputDeviceName;
  const restoreStereoPlayback = options.restoreStereoPlayback ?? false;
  const forceReopen = options.forceReopen ?? true;
  const response = sendNativeAudioCommand('refresh_audio_device', {
    useSystemDefault: outputDeviceName ? false : useSystemDefault,
    forceReopen,
    restoreStereoPlayback,
    ...(outputDeviceName ? {outputDeviceName} : {}),
  });
  if (!response?.includes('"ok":true')) {
    return false;
  }

  if (options.syncArrangement === false) {
    return true;
  }

  const {tracks, blocks} = useDAWStore.getState();
  syncTempoMapToEngine();
  syncMasterMixToEngine();
  syncFileBackedAudioClips(blocks);
  blocks.forEach(block => {
    if (isDrumPatternBlock(block)) {
      upsertBlockForEngine(block);
    }
  });
  syncTrackInstruments(tracks);
  return true;
}

/** Reopen output and re-bind clips/instruments. */
export function refreshPlaybackAndInstruments(options?: RefreshPlaybackOptions): void {
  runRefreshPlayback(options ?? {});
}

/** Startup/visibility heal: check the device without rebuilding every saved clip. */
export function refreshPlaybackDeviceOnly(options?: RefreshPlaybackOptions): void {
  runRefreshPlayback({...options, syncArrangement: false});
}

/**
 * After voice capture the OS often switches BT to a hands-free profile.
 * Release the mic manager, then force stereo playback on the pre-record device.
 */
export function refreshPlaybackOutputAfterVoice(): void {
  sendNativeAudioCommand('release_mic_capture', {});

  const locked =
    lockedPlaybackOutputDevice && !isHandsFreeDeviceName(lockedPlaybackOutputDevice)
      ? lockedPlaybackOutputDevice
      : null;

  if (locked) {
    const ok = runRefreshPlayback({
      useSystemDefault: false,
      outputDeviceName: locked,
      restoreStereoPlayback: true,
    });
    const status = parseCommandData(sendNativeAudioCommand('engine_status_fast', {}));
    if (ok && isStereoPlaybackHealthy(status)) {
      return;
    }
  }

  runRefreshPlayback({useSystemDefault: true, restoreStereoPlayback: true});
}

/** Toolbar Refresh — same heal path as after voice stop. */
export function refreshAudioOutputLikeToolbar(): void {
  refreshPlaybackOutputAfterVoice();
}

/** Upsert every clip after output device heal (voice WAV must not load before refresh). */
export function syncAllBlocksToEngine(): void {
  const {blocks} = useDAWStore.getState();
  syncTempoMapToEngine();
  syncMasterMixToEngine();
  blocks.forEach(block => {
    upsertBlockForEngine(block);
  });
  syncLoopRangeToEngine();
}

/**
 * Re-bind track mapping only — no clip upserts (voice heal upserts after refresh).
 */
export function resyncEngineAfterVoiceRecording(): void {
  const {tracks} = useDAWStore.getState();
  syncTempoMapToEngine();
  syncTracksToEngine(tracks);
  syncMasterMixToEngine();
  syncLoopRangeToEngine();
}
