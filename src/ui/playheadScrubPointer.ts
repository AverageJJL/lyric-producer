import {DEFAULT_TIMELINE_BEATS, PIXELS_PER_BEAT, clamp} from './timelineLayout';

export type PlayheadScrubSession = {
  pointerId: number;
  grabOffsetBeats: number;
};

export type PlayheadScrubConfig = {
  getTimelineClientX: () => number;
  getPlayheadBeat: () => number;
  getMaxTimelineBeat?: () => number;
  pixelsPerBeat?: number;
  sessionRef: {current: PlayheadScrubSession | null};
  onScrubBeat: (beat: number, options: {syncTransport: boolean}) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
};

export type PlayheadPointerEvent = {
  nativeEvent?: {
    button?: number;
    pointerId: number;
    clientX: number;
  };
  button?: number;
  pointerId: number;
  clientX: number;
};

/** Convert viewport pointer position to a timeline beat using the live beat-0 edge. */
export function clientXToBeat(
  clientX: number,
  timelineClientX: number,
  maxTimelineBeat = DEFAULT_TIMELINE_BEATS,
  pixelsPerBeat = PIXELS_PER_BEAT,
): number {
  return clamp(
    (clientX - timelineClientX) / pixelsPerBeat,
    0,
    Math.max(0, maxTimelineBeat),
  );
}

function scrubBeatFromClientX(
  config: PlayheadScrubConfig,
  clientX: number,
  grabOffsetBeats: number,
): number {
  const maxTimelineBeat = config.getMaxTimelineBeat?.() ?? DEFAULT_TIMELINE_BEATS;
  const beat = clientXToBeat(
    clientX,
    config.getTimelineClientX(),
    maxTimelineBeat,
    config.pixelsPerBeat ?? PIXELS_PER_BEAT,
  ) + grabOffsetBeats;
  return clamp(
    beat,
    0,
    Math.max(0, maxTimelineBeat),
  );
}

export function createPlayheadScrubHandlers(config: PlayheadScrubConfig) {
  const onPointerDown = (event: PlayheadPointerEvent) => {
    const pointer = pointerData(event);
    if (pointer.button !== undefined && pointer.button !== 0) {
      return;
    }

    const beatAtPointer = clientXToBeat(
      pointer.clientX,
      config.getTimelineClientX(),
      config.getMaxTimelineBeat?.() ?? DEFAULT_TIMELINE_BEATS,
      config.pixelsPerBeat ?? PIXELS_PER_BEAT,
    );
    const grabOffsetBeats = config.getPlayheadBeat() - beatAtPointer;

    config.sessionRef.current = {pointerId: pointer.pointerId, grabOffsetBeats};
    config.onScrubStart();
    config.onScrubBeat(scrubBeatFromClientX(config, pointer.clientX, grabOffsetBeats), {
      syncTransport: false,
    });
  };

  const onPointerMove = (event: PlayheadPointerEvent) => {
    const session = config.sessionRef.current;
    const pointer = pointerData(event);
    if (!session || pointer.pointerId !== session.pointerId) {
      return;
    }

    config.onScrubBeat(scrubBeatFromClientX(config, pointer.clientX, session.grabOffsetBeats), {
      syncTransport: false,
    });
  };

  const finish = (event: PlayheadPointerEvent) => {
    const session = config.sessionRef.current;
    const pointer = pointerData(event);
    if (!session || pointer.pointerId !== session.pointerId) {
      return;
    }

    // Native transport only needs the final scrubbed position, not every drag frame.
    config.onScrubBeat(scrubBeatFromClientX(config, pointer.clientX, session.grabOffsetBeats), {
      syncTransport: true,
    });
    config.sessionRef.current = null;
    config.onScrubEnd();
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
  };
}

function pointerData(event: PlayheadPointerEvent): {
  button?: number;
  pointerId: number;
  clientX: number;
} {
  const native = event.nativeEvent;
  return {
    button: native?.button ?? event.button,
    pointerId: native?.pointerId ?? event.pointerId,
    clientX: native?.clientX ?? event.clientX,
  };
}
