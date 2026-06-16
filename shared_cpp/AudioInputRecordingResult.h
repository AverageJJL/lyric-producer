#pragma once

#include <vector>

#include <juce_audio_formats/juce_audio_formats.h>

namespace musicapp {

struct AudioInputRecordingResult {
  double durationSeconds = 0.0;
  juce::int64 fileBytes = 0;
  float peakAmplitude = 0.0f;
  std::vector<float> waveformPeaks;
};

AudioInputRecordingResult analyzeStoppedAudioRecording(
    const juce::File& targetFile,
    juce::int64 samplesWritten);

}  // namespace musicapp
