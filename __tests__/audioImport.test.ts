import {createImportedAudioBlock} from '../src/music/audioImport';

describe('audio import block factory', () => {
  it('creates a non-destructive audio clip from native analysis metadata', () => {
    const block = createImportedAudioBlock({
      trackId: 'track-audio',
      trackIndex: 1,
      startBeat: 4,
      name: 'Loop',
      relativePath: 'imports/loop.wav',
      absolutePath: '/tmp/loop.wav',
      analysis: {
        lengthBeats: 7.5,
        durationSeconds: 3.75,
        sampleRate: 44100,
        channelCount: 2,
        fileBytes: 1024,
        peakAmplitude: 0.5,
        waveformPeaks: [-1, 0.25, 2],
      },
      projectSampleRate: 48000,
    });

    expect(block).toMatchObject({
      trackId: 'track-audio',
      name: 'Loop',
      startBeat: 4,
      lengthBeats: 7.5,
      type: 'audio',
      sourceLengthBeats: 7.5,
      sourceOffsetBeats: 0,
      audioFilePath: 'imports/loop.wav',
      absoluteAudioFilePath: '/tmp/loop.wav',
      durationSeconds: 3.75,
      sourceSampleRate: 44100,
      sourceChannelCount: 2,
      sourceFileBytes: 1024,
      sourcePeakAmplitude: 0.5,
      mediaValidationWarning: 'Source sample rate 44100 Hz differs from device 48000 Hz.',
      waveformPeaks: [0, 0.25, 1],
    });
  });
});
