import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import type {DAWBlock, DAWTrack} from '../src/store/useDAWStore';
import {LooperCompPanel} from '../src/web/components/LooperCompPanel';

const track: DAWTrack = {
  id: 'track-voice',
  name: 'Voice',
  isMuted: false,
  isSolo: false,
  type: 'voice_audio',
  instrumentId: 'voice_audio',
  presetId: 'voice_audio',
  isRecordArmed: false,
  isLocked: false,
};

function layer(id: string, index: number, isMuted?: boolean): DAWBlock {
  return {
    id,
    trackId: track.id,
    name: `Overdub ${index + 1}`,
    startBeat: 0,
    lengthBeats: 16,
    type: 'audio',
    color: '#8ee3f5',
    looperLayerId: `looper:track-voice:${index}`,
    looperLayerIndex: index,
    looperLengthBeats: 16,
    isMuted,
  };
}

describe('LooperCompPanel', () => {
  it('renders looper take rows and dispatches comp/select commands', () => {
    const onCompLayer = jest.fn();
    const onSelectBlock = jest.fn();
    render(
      <LooperCompPanel
        blocks={[layer('layer-a', 0), layer('layer-b', 1, true)]}
        tracks={[track]}
        onCompLayer={onCompLayer}
        onSelectBlock={onSelectBlock}
      />,
    );

    expect(screen.getByRole('region', {name: 'Looper comping'})).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', {name: 'Comp'})[1]!);
    fireEvent.click(screen.getByRole('button', {name: 'Select Overdub 2'}));

    expect(onCompLayer).toHaveBeenCalledWith('looper:track-voice:1');
    expect(onSelectBlock).toHaveBeenCalledWith('layer-b');
  });

  it('stays hidden when the project has no looper layers', () => {
    const {container} = render(
      <LooperCompPanel blocks={[]} tracks={[track]} onCompLayer={jest.fn()} onSelectBlock={jest.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
