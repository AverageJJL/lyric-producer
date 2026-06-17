import React from 'react';
import {render} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {PianoRollPanel} from '../src/web/components/PianoRollPanel';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: () => '{"ok":true}',
}));

const track: DAWTrack = {
  id: 'track-1',
  name: 'Keys',
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'keys_piano',
  presetId: 'splendid_grand_lite',
  isRecordArmed: false,
  isLocked: false,
};

const block: DAWBlock = {
  id: 'clip-1',
  trackId: track.id,
  name: 'Hook',
  startBeat: 0,
  lengthBeats: 4,
  type: 'midi',
  color: '#4a7fd4',
  notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
};

function renderRuler(startBeat: number) {
  useDAWStore.setState({
    tracks: [track],
    blocks: [{...block, startBeat}],
    selectedBlockId: block.id,
    selectedBlockIds: [block.id],
    selectedTrackId: track.id,
    playheadBeat: startBeat,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    meterMap: [],
  });
  const {container} = render(<PianoRollPanel blockId={block.id} track={track} />);
  return [...container.querySelectorAll('.piano-roll-grid-ruler span')].map(label => ({
    left: (label as HTMLElement).style.left,
    text: label.textContent,
  }));
}

describe('PianoRollPanel ruler', () => {
  it('aligns ruler labels to project bars for a bar-one clip', () => {
    expect(renderRuler(0)).toEqual([
      {left: '0%', text: '1'},
      {left: '100%', text: '2'},
    ]);
  });

  it('continues project bar labels for a later clip', () => {
    expect(renderRuler(4)).toEqual([
      {left: '0%', text: '2'},
      {left: '100%', text: '3'},
    ]);
  });
});
