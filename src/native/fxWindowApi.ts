export type FxWindowTrackSummary = {
  id: string;
  name: string;
  type: string;
  instrumentId?: string;
  presetId?: string;
  automationMode?: string;
};

export type FxWindowSyncPayload = {
  targetTrackId: string | null;
  selectedTrackId: string | null;
  tracks: FxWindowTrackSummary[];
};

export type FxWindowBridge = {
  open: (trackId: string) => void;
  syncState: (payload: FxWindowSyncPayload) => void;
  onState: (callback: (payload: FxWindowSyncPayload) => void) => () => void;
  notifyChanged: () => void;
  onSummaryRefresh: (callback: () => void) => () => void;
};

declare global {
  interface Window {
    fxWindow?: FxWindowBridge;
  }
}

export {};
