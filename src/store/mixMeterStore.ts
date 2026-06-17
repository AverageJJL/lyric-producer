import {create} from 'zustand';

export type MeterValue = {
  db: number;
  linear: number;
};

export type MeterChannel = {
  index: number;
  peak: MeterValue;
};

export type TrackMeterSnapshot = {
  trackId: string;
  name: string;
  peak: MeterValue;
  peakHold: MeterValue;
  clipping: boolean;
  channels: MeterChannel[];
};

export type InputMeterSnapshot = Omit<TrackMeterSnapshot, 'trackId' | 'name'> & {
  active: boolean;
  deviceName: string;
};

export type MixMeterSnapshot = {
  schemaVersion: 1;
  source: 'tracktion_level_measurer';
  timestampMs: number;
  input: InputMeterSnapshot;
  master: Omit<TrackMeterSnapshot, 'trackId' | 'name'>;
  tracks: Record<string, TrackMeterSnapshot>;
};

type MixMeterStore = {
  snapshot: MixMeterSnapshot | null;
  applySnapshot: (snapshot: MixMeterSnapshot) => void;
  clear: () => void;
};

const SILENT_VALUE: MeterValue = {db: -100, linear: 0};

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseMeterValue(value: unknown): MeterValue {
  const record = value && typeof value === 'object' ? value as Partial<MeterValue> : {};
  return {
    db: Math.max(-100, Math.min(12, finiteNumber(record.db, SILENT_VALUE.db))),
    linear: Math.max(0, finiteNumber(record.linear, SILENT_VALUE.linear)),
  };
}

function parseChannels(value: unknown): MeterChannel[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item, index) => {
    const record = item && typeof item === 'object' ? item as Partial<MeterChannel> : {};
    return {
      index: finiteNumber(record.index, index),
      peak: parseMeterValue(record.peak),
    };
  });
}

function parseMeterBlock(value: unknown) {
  const record = value && typeof value === 'object'
    ? value as {peak?: unknown; peakHold?: unknown; clipping?: unknown; channels?: unknown}
    : {};
  return {
    peak: parseMeterValue(record.peak),
    peakHold: parseMeterValue(record.peakHold),
    clipping: record.clipping === true,
    channels: parseChannels(record.channels),
  };
}

export function parseMixMeterSnapshot(payload: unknown): MixMeterSnapshot | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as {
    schemaVersion?: unknown;
    source?: unknown;
    timestampMs?: unknown;
    input?: unknown;
    master?: unknown;
    tracks?: unknown;
  };
  if (record.schemaVersion !== 1 || record.source !== 'tracktion_level_measurer') {
    return null;
  }

  const tracks: Record<string, TrackMeterSnapshot> = {};
  if (Array.isArray(record.tracks)) {
    for (const item of record.tracks) {
      const track = item && typeof item === 'object'
        ? item as {trackId?: unknown; name?: unknown}
        : {};
      if (typeof track.trackId !== 'string' || track.trackId.length === 0) {
        continue;
      }
      tracks[track.trackId] = {
        ...parseMeterBlock(item),
        trackId: track.trackId,
        name: typeof track.name === 'string' ? track.name : track.trackId,
      };
    }
  }

  return {
    schemaVersion: 1,
    source: 'tracktion_level_measurer',
    timestampMs: finiteNumber(record.timestampMs, Date.now()),
    input: {
      ...parseMeterBlock(record.input),
      active: Boolean((record.input as {active?: unknown} | undefined)?.active),
      deviceName: typeof (record.input as {deviceName?: unknown} | undefined)?.deviceName === 'string'
        ? (record.input as {deviceName: string}).deviceName
        : '',
    },
    master: parseMeterBlock(record.master),
    tracks,
  };
}

export const useMixMeterStore = create<MixMeterStore>(set => ({
  snapshot: null,
  applySnapshot: snapshot => set({snapshot}),
  clear: () => set({snapshot: null}),
}));

export function applyMixMeterUpdatePayload(payload: unknown): void {
  const snapshot = parseMixMeterSnapshot(payload);
  if (snapshot) {
    useMixMeterStore.getState().applySnapshot(snapshot);
  }
}
