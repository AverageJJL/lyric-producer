import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {buildPianoRollGridModel} from '../src/web/components/pianoRollGeometry';

describe('pianoRollGeometry', () => {
  it('labels project bars at the clip boundaries in 4/4', () => {
    const model = buildPianoRollGridModel({
      clipStartBeat: 0,
      clipLengthBeats: 4,
      timeSignature: DEFAULT_TIME_SIGNATURE,
      meterMap: [],
    });

    expect(model.rulerTicks).toEqual([
      {key: 'ruler-0', left: '0%', label: '1'},
      {key: 'ruler-4', left: '100%', label: '2'},
    ]);
    expect(model.gridLines.filter(line => line.kind === 'bar').map(line => line.left))
      .toEqual(['0%', '100%']);
  });

  it('continues project bar labels for clips that start after bar one', () => {
    const model = buildPianoRollGridModel({
      clipStartBeat: 4,
      clipLengthBeats: 4,
      timeSignature: DEFAULT_TIME_SIGNATURE,
      meterMap: [],
    });

    expect(model.rulerTicks.map(tick => tick.label)).toEqual(['2', '3']);
    expect(model.rulerTicks.map(tick => tick.left)).toEqual(['0%', '100%']);
  });

  it('uses meter map bar starts inside the piano-roll clip window', () => {
    const model = buildPianoRollGridModel({
      clipStartBeat: 4,
      clipLengthBeats: 8,
      timeSignature: DEFAULT_TIME_SIGNATURE,
      meterMap: [
        {id: 'meter-six', beat: 6, timeSignature: {numerator: 3, denominator: 4}},
      ],
    });

    expect(model.rulerTicks.map(tick => ({left: tick.left, label: tick.label}))).toEqual([
      {left: '0%', label: '2'},
      {left: '25%', label: '3'},
      {left: '62.5%', label: '4'},
      {left: '100%', label: '5'},
    ]);
  });
});
