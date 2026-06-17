import {act, renderHook} from '@testing-library/react';

import {useFxSlotDraft} from '../src/hooks/useFxSlotDraft';
import {emptyTrackFxState} from '../src/native/fxContract';

describe('useFxSlotDraft', () => {
  it('updates draft locally without calling onCommit until commitDraft', () => {
    const onCommit = jest.fn();
    const base = emptyTrackFxState('track-1');
    const {result, rerender} = renderHook(
      ({state}) =>
        useFxSlotDraft({
          slotId: 'eq',
          state,
          onCommit,
        }),
      {initialProps: {state: base}},
    );

    act(() => {
      result.current.setDraftParam('treble', 0.72);
    });
    expect(result.current.draftValues.treble).toBe(0.72);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      result.current.commitDraft();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0][0];
    expect(committed.slots.find(slot => slot.slot === 'eq')?.params.values.treble).toBe(0.72);

    const nativeConfirmed = {
      ...base,
      slots: base.slots.map(slot =>
        slot.slot === 'eq'
          ? {
              ...slot,
              params: {
                ...slot.params,
                values: {...slot.params.values, treble: 0.72},
              },
            }
          : slot,
      ),
    };
    rerender({state: nativeConfirmed});
    expect(result.current.draftValues.treble).toBe(0.72);
  });

  it('does not reset draft while editing', () => {
    const onCommit = jest.fn();
    const base = emptyTrackFxState('track-1');
    const {result, rerender} = renderHook(
      ({state}) =>
        useFxSlotDraft({
          slotId: 'compressor',
          state,
          onCommit,
        }),
      {initialProps: {state: base}},
    );

    act(() => {
      result.current.setDraftParam('ratio', 0.8);
    });
    rerender({state: base});
    expect(result.current.draftValues.ratio).toBe(0.8);
  });
});
