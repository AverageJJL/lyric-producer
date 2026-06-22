import {create} from 'zustand';

type NativeAudioSyncStatusState = {
  preparingAudioPreviewCount: number;
  setPreparingAudioPreviewCount: (count: number) => void;
};

export const useNativeAudioSyncStatusStore = create<NativeAudioSyncStatusState>(set => ({
  preparingAudioPreviewCount: 0,
  setPreparingAudioPreviewCount: count =>
    set({preparingAudioPreviewCount: Math.max(0, Math.floor(count))}),
}));

export function setNativeAudioPreviewPreparing(isPreparing: boolean): void {
  const store = useNativeAudioSyncStatusStore.getState();
  const current = store.preparingAudioPreviewCount;
  store.setPreparingAudioPreviewCount(isPreparing ? current + 1 : current - 1);
}
