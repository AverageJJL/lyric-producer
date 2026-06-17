import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {parseNativeCommandError, parseNativeCommandOk} from '../native/parseNativeResponse';
import {sendNativeAudioCommand} from '../native/NativeAudioEngine';
import {capturePlaybackOutputDevice} from '../native/refreshPlayback';
import {buildNativeTransportPayload} from '../native/transportPayload';
import {stopActiveRecordingSession} from '../store/dawRecording';
import type {DAWTrack} from '../store/useDAWStore';
import {useDAWStore} from '../store/useDAWStore';
import {
  recordingBeatRangeSeconds,
  recordingCountInSeconds,
  recordingPreRollSeconds,
} from '../transport/recordingPreferences';
import {tempoMapSecondsAtBeat} from '../transport/tempoMapTiming';

type RecordingLeadInState = {
  trackId: string;
  phase: 'count-in' | 'pre-roll';
  recordStartBeat: number;
  recordStopBeat?: number;
  effectivePreRollBeats: number;
};

type RecordingLaunchOptions = {
  armedTrack: DAWTrack | null;
  activeTrack: DAWTrack | null;
};

export function useRecordingLaunch({armedTrack, activeTrack}: RecordingLaunchOptions) {
  const bpm = useDAWStore(state => state.bpm);
  const tempoMap = useDAWStore(state => state.tempoMap);
  const recordingCountInBeats = useDAWStore(state => state.recordingCountInBeats);
  const recordingPreRollBeats = useDAWStore(state => state.recordingPreRollBeats);
  const isPunchRecordingEnabled = useDAWStore(state => state.isPunchRecordingEnabled);
  const isLoopRecordingEnabled = useDAWStore(state => state.isLoopRecordingEnabled);
  const recordingLatencyCompensationMs = useDAWStore(state => state.recordingLatencyCompensationMs);
  const cycleStartBeat = useDAWStore(state => state.cycleStartBeat);
  const cycleEndBeat = useDAWStore(state => state.cycleEndBeat);
  const setRecordingCountInBeats = useDAWStore(state => state.setRecordingCountInBeats);
  const setRecordingPreRollBeats = useDAWStore(state => state.setRecordingPreRollBeats);
  const setPunchRecordingEnabled = useDAWStore(state => state.setPunchRecordingEnabled);
  const setRecordingLatencyCompensationMs = useDAWStore(state => state.setRecordingLatencyCompensationMs);
  const startRecordingSession = useDAWStore(state => state.startRecordingSession);
  const activateRecordingSession = useDAWStore(state => state.activateRecordingSession);
  const abortRecordingSession = useDAWStore(state => state.abortRecordingSession);
  const clearRecordingError = useDAWStore(state => state.clearRecordingError);
  const setIsPlaying = useDAWStore(state => state.setIsPlaying);
  const [leadInState, setLeadInState] = useState<RecordingLeadInState | null>(null);
  const leadInStateRef = useRef<RecordingLeadInState | null>(null);
  const leadInTimerRef = useRef<number | null>(null);
  const punchOutTimerRef = useRef<number | null>(null);
  const canPunchRecord = cycleEndBeat > cycleStartBeat;
  const canLoopRecord = canPunchRecord && (armedTrack ?? activeTrack)?.type !== 'drum_machine';

  const setLeadIn = useCallback((nextLeadInState: RecordingLeadInState | null) => {
    leadInStateRef.current = nextLeadInState;
    setLeadInState(nextLeadInState);
  }, []);

  const clearLeadInTimer = useCallback(() => {
    if (leadInTimerRef.current !== null) {
      window.clearTimeout(leadInTimerRef.current);
      leadInTimerRef.current = null;
    }
  }, []);

  const clearPunchOutTimer = useCallback(() => {
    if (punchOutTimerRef.current !== null) {
      window.clearTimeout(punchOutTimerRef.current);
      punchOutTimerRef.current = null;
    }
  }, []);

  const restoreClickPreference = useCallback(() => {
    sendNativeAudioCommand('set_click_track', {
      enabled: useDAWStore.getState().isMetronomeEnabled,
    });
  }, []);

  const startLeadInTransport = useCallback((beat: number, forceClick: boolean) => {
    const state = useDAWStore.getState();
    const startBeat = Math.max(0, beat);
    const startSeconds = tempoMapSecondsAtBeat(startBeat, state.bpm, state.tempoMap);
    useDAWStore.getState().setPlayheadBeat(startBeat, {syncTransport: false});
    setIsPlaying(true);
    if (forceClick) {
      sendNativeAudioCommand('set_click_track', {enabled: true});
    }
    sendNativeAudioCommand(
      'transport_play',
      buildNativeTransportPayload(true, startBeat, startSeconds),
    );
  }, [setIsPlaying]);

  const startNativeCountInClick = useCallback((recordStartBeat: number, beats: number) => {
    const response = sendNativeAudioCommand('start_count_in_click', {
      beats,
      recordStartBeat,
      bpm: useDAWStore.getState().bpm,
      tempoMap: useDAWStore.getState().tempoMap,
      meterMap: useDAWStore.getState().meterMap,
    });
    if (parseNativeCommandOk(response)) {
      useDAWStore.setState({nativeCountInActive: true, syncSource: 'ui'});
      return null;
    }
    useDAWStore.setState({nativeCountInActive: false, syncSource: 'ui'});
    return parseNativeCommandError(response) ?? 'Could not start count-in click.';
  }, []);

  const stopNativeCountInClick = useCallback((restoreBeat?: number) => {
    sendNativeAudioCommand('stop_count_in_click', {restoreBeat});
    useDAWStore.setState({nativeCountInActive: false, syncSource: 'ui'});
  }, []);

  const handleStopRecording = useCallback(() => {
    clearPunchOutTimer();
    stopActiveRecordingSession();
  }, [clearPunchOutTimer]);

  const cancelLeadIn = useCallback(() => {
    const pendingLeadIn = leadInStateRef.current;
    clearLeadInTimer();
    setLeadIn(null);
    if (pendingLeadIn) {
      if (pendingLeadIn.phase === 'count-in') {
        stopNativeCountInClick(useDAWStore.getState().playheadBeat);
        restoreClickPreference();
        return;
      }

      setIsPlaying(false);
      restoreClickPreference();
      useDAWStore.getState().setPlayheadBeat(pendingLeadIn.recordStartBeat, {
        syncTransport: true,
      });
    }
  }, [clearLeadInTimer, restoreClickPreference, setIsPlaying, setLeadIn, stopNativeCountInClick]);

  useEffect(() => () => {
    clearLeadInTimer();
    clearPunchOutTimer();
  }, [clearLeadInTimer, clearPunchOutTimer]);

  const schedulePunchOut = useCallback((startBeat: number, stopBeat?: number) => {
    clearPunchOutTimer();
    if (stopBeat === undefined || stopBeat <= startBeat) {
      return;
    }
    punchOutTimerRef.current = window.setTimeout(
      () => {
        punchOutTimerRef.current = null;
        stopActiveRecordingSession();
      },
      recordingBeatRangeSeconds(startBeat, stopBeat, bpm, tempoMap) * 1000,
    );
  }, [bpm, clearPunchOutTimer, tempoMap]);

  const startNativeRecording = useCallback((
    recordTrackId: string,
    requestedStartBeat?: number,
    requestedStopBeat?: number,
  ) => {
    const recordTrack = useDAWStore.getState().tracks.find(track => track.id === recordTrackId);
    if (!recordTrack) {
      setLeadIn(null);
      return;
    }

    clearRecordingError();
    const startBeat = Math.max(0, requestedStartBeat ?? useDAWStore.getState().playheadBeat);
    useDAWStore.getState().setPlayheadBeat(startBeat, {syncTransport: false});
    const clipId = startRecordingSession(recordTrack.id, startBeat);
    if (!clipId) {
      setLeadIn(null);
      return;
    }
    const block = useDAWStore.getState().blocks.find(item => item.id === clipId);
    const clipStartBeat = block?.startBeat ?? startBeat;
    if (recordTrack.type === 'voice_audio') {
      capturePlaybackOutputDevice();
    }
    let captureStarted = false;
    if (recordTrack.type !== 'voice_audio' && recordTrack.type !== 'drum_machine') {
      const response = sendNativeAudioCommand('start_recording', {trackId: recordTrack.id, clipId, startBeat: clipStartBeat});
      if (!parseNativeCommandOk(response)) {
        abortRecordingSession(parseNativeCommandError(response) ?? 'Could not start recording.');
        setLeadIn(null);
        return;
      }
      captureStarted = true;
    } else if (recordTrack.type === 'voice_audio') {
      const response = sendNativeAudioCommand('start_audio_recording', {trackId: recordTrack.id, clipId, startBeat: clipStartBeat});
      if (!parseNativeCommandOk(response)) {
        abortRecordingSession(parseNativeCommandError(response) ?? 'Could not start recording.');
        setLeadIn(null);
        return;
      }
      captureStarted = true;
    }
    const transportResponse = sendNativeAudioCommand(
      'transport_play',
      buildNativeTransportPayload(
        true,
        startBeat,
        tempoMapSecondsAtBeat(startBeat, useDAWStore.getState().bpm, useDAWStore.getState().tempoMap),
      ),
    );
    if (!parseNativeCommandOk(transportResponse)) {
      if (captureStarted) {
        sendNativeAudioCommand(
          recordTrack.type === 'voice_audio' ? 'stop_audio_recording' : 'stop_recording',
          {trackId: recordTrack.id, clipId},
        );
      }
      abortRecordingSession(parseNativeCommandError(transportResponse) ?? 'Could not start transport.');
      setLeadIn(null);
      return;
    }
    setLeadIn(null);
    restoreClickPreference();
    activateRecordingSession();
    setIsPlaying(true);
    schedulePunchOut(clipStartBeat, requestedStopBeat);
  }, [
    abortRecordingSession,
    activateRecordingSession,
    clearRecordingError,
    restoreClickPreference,
    schedulePunchOut,
    setIsPlaying,
    setLeadIn,
    startRecordingSession,
  ]);

  const startPreRoll = useCallback((
    recordTrackId: string,
    recordStartBeat: number,
    effectivePreRollBeats: number,
    recordStopBeat?: number,
  ) => {
    if (effectivePreRollBeats <= 0) {
      startNativeRecording(recordTrackId, recordStartBeat, recordStopBeat);
      return;
    }

    const preRollStartBeat = Math.max(0, recordStartBeat - effectivePreRollBeats);
    setLeadIn({
      trackId: recordTrackId,
      phase: 'pre-roll',
      recordStartBeat,
      recordStopBeat,
      effectivePreRollBeats,
    });
    startLeadInTransport(preRollStartBeat, false);
    leadInTimerRef.current = window.setTimeout(
      () => {
        leadInTimerRef.current = null;
        startNativeRecording(recordTrackId, recordStartBeat, recordStopBeat);
      },
      recordingPreRollSeconds(effectivePreRollBeats, bpm, tempoMap, recordStartBeat) * 1000,
    );
  }, [bpm, setLeadIn, startLeadInTransport, startNativeRecording, tempoMap]);

  const handleStartRecording = useCallback(() => {
    const recordTrack = armedTrack ?? activeTrack;
    if (!recordTrack || leadInState) {
      return;
    }

    clearRecordingError();
    const state = useDAWStore.getState();
    const punchActive = state.isPunchRecordingEnabled && state.cycleEndBeat > state.cycleStartBeat;
    const loopActive =
      !punchActive &&
      (state.isCycleEnabled || state.isLoopRecordingEnabled) &&
      state.cycleEndBeat > state.cycleStartBeat &&
      recordTrack.type !== 'drum_machine';
    if (loopActive && !state.isCycleEnabled) {
      useDAWStore.setState({isCycleEnabled: true, syncSource: 'ui'});
    }
    const recordStartBeat = punchActive || loopActive ? state.cycleStartBeat : state.playheadBeat;
    const recordStopBeat = punchActive ? state.cycleEndBeat : undefined;
    const effectivePreRollBeats = Math.min(state.recordingPreRollBeats, recordStartBeat);
    if (state.recordingCountInBeats > 0 || effectivePreRollBeats > 0) {
      if (state.recordingCountInBeats > 0) {
        setLeadIn({
          trackId: recordTrack.id,
          phase: 'count-in',
          recordStartBeat,
          recordStopBeat,
          effectivePreRollBeats,
        });
        const countInError = startNativeCountInClick(recordStartBeat, state.recordingCountInBeats);
        if (countInError) {
          useDAWStore.getState().abortRecordingSession(countInError);
          setLeadIn(null);
          restoreClickPreference();
          return;
        }
        leadInTimerRef.current = window.setTimeout(
          () => {
            leadInTimerRef.current = null;
            stopNativeCountInClick(recordStartBeat);
            startPreRoll(recordTrack.id, recordStartBeat, effectivePreRollBeats, recordStopBeat);
          },
          recordingCountInSeconds(
            state.recordingCountInBeats,
            state.bpm,
            state.tempoMap,
            recordStartBeat,
          ) * 1000,
        );
        return;
      }

      startPreRoll(recordTrack.id, recordStartBeat, effectivePreRollBeats, recordStopBeat);
      return;
    }

    startNativeRecording(recordTrack.id, recordStartBeat, recordStopBeat);
  }, [
    armedTrack,
    activeTrack,
    clearRecordingError,
    leadInState,
    restoreClickPreference,
    setLeadIn,
    startNativeCountInClick,
    startNativeRecording,
    startPreRoll,
    stopNativeCountInClick,
  ]);

  const leadInLabel = useMemo(() => {
    if (!leadInState) {
      return undefined;
    }
    if (leadInState.phase === 'pre-roll') {
      return `Pre-roll · ${leadInState.effectivePreRollBeats} beats`;
    }
    return `Count-in · ${recordingCountInBeats} beats`;
  }, [leadInState, recordingCountInBeats]);

  const pendingActionLabel = leadInState?.phase === 'pre-roll'
    ? 'Cancel Pre-roll'
    : 'Cancel Count-in';

  return {
    canPunchRecord,
    canLoopRecord,
    isLeadInPending: leadInState != null,
    leadInLabel,
    pendingActionLabel,
    recordingCountInBeats,
    recordingPreRollBeats,
    isPunchRecordingEnabled,
    isLoopRecordingEnabled,
    recordingLatencyCompensationMs,
    setRecordingCountInBeats,
    setRecordingPreRollBeats,
    setPunchRecordingEnabled,
    setRecordingLatencyCompensationMs,
    handleStartRecording,
    handleStopRecording,
    cancelLeadIn,
  };
}
