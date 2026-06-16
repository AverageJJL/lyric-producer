#include "AudioInputRecordingResult.h"

#include "WaveformPeaks.h"

#include <memory>

namespace musicapp {

AudioInputRecordingResult analyzeStoppedAudioRecording(
    const juce::File& targetFile,
    juce::int64 samplesWritten) {
  AudioInputRecordingResult result;
  result.fileBytes = targetFile.existsAsFile() ? targetFile.getSize() : 0;

  juce::AudioFormatManager formatManager;
  formatManager.registerBasicFormats();
  if (targetFile.existsAsFile() && result.fileBytes > 64) {
    if (auto reader = std::unique_ptr<juce::AudioFormatReader>(
            formatManager.createReaderFor(targetFile))) {
      if (reader->lengthInSamples > 0 && reader->sampleRate > 0.0) {
        result.durationSeconds = static_cast<double>(reader->lengthInSamples)
                                 / static_cast<double>(reader->sampleRate);
      }
    }
  }

  if (result.durationSeconds <= 0.0 && samplesWritten > 0) {
    result.durationSeconds = static_cast<double>(samplesWritten) / 44100.0;
  }

  if (result.fileBytes > 64) {
    const auto peakAnalysis = computeWaveformPeakAnalysis(
        targetFile,
        peakCountForDuration(result.durationSeconds));
    result.waveformPeaks = peakAnalysis.waveformPeaks;
    result.peakAmplitude = peakAnalysis.peakAmplitude;
  }

  return result;
}

}  // namespace musicapp
