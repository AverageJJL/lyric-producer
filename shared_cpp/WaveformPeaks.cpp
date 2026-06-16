#include "WaveformPeaks.h"

#include <juce_audio_formats/juce_audio_formats.h>

#include <algorithm>
#include <cmath>

namespace musicapp {

namespace {

std::vector<float> normalizedWaveformPeaks(std::vector<float> peaks) {
  constexpr float silenceGate = 0.02f;
  float maxPeak = 0.0f;
  for (float value : peaks) {
    maxPeak = std::max(maxPeak, value);
  }

  if (maxPeak < silenceGate) {
    return std::vector<float>(peaks.size(), 0.0f);
  }

  for (float& value : peaks) {
    value = value < silenceGate ? 0.0f : value / maxPeak;
  }
  return peaks;
}

float bufferPeak(const juce::AudioBuffer<float>& buffer, int channels, int samples) {
  float peak = 0.0f;
  for (int channel = 0; channel < channels; ++channel) {
    const float* data = buffer.getReadPointer(channel);
    for (int sample = 0; sample < samples; ++sample) {
      peak = std::max(peak, std::abs(data[sample]));
    }
  }
  return peak;
}

}  // namespace

int peakCountForDuration(double durationSeconds) {
  constexpr int kMinPoints = 256;
  constexpr int kMaxPoints = 4096;
  constexpr double kPointsPerSecond = 50.0;
  const int count = static_cast<int>(std::ceil(std::max(0.0, durationSeconds) * kPointsPerSecond));
  return std::clamp(count, kMinPoints, kMaxPoints);
}

std::vector<float> computeWaveformPeaks(const juce::File& audioFile, int pointCount) {
  return computeWaveformPeakAnalysis(audioFile, pointCount).waveformPeaks;
}

AudioFilePeakAnalysis computeWaveformPeakAnalysis(const juce::File& audioFile, int pointCount) {
  AudioFilePeakAnalysis analysis;
  auto& peaks = analysis.waveformPeaks;
  peaks.assign(static_cast<std::size_t>(std::max(8, pointCount)), 0.0f);
  if (!audioFile.existsAsFile()) {
    return analysis;
  }

  juce::AudioFormatManager formatManager;
  formatManager.registerBasicFormats();
  std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(audioFile));
  if (reader == nullptr) {
    return analysis;
  }

  const juce::int64 totalSamples = reader->lengthInSamples;
  const int channels = static_cast<int>(reader->numChannels);
  if (totalSamples <= 0 || channels <= 0) {
    return analysis;
  }

  const int samplesPerPoint = static_cast<int>(
      std::max<juce::int64>(1, totalSamples / static_cast<juce::int64>(peaks.size())));

  juce::AudioBuffer<float> buffer(channels, samplesPerPoint);
  juce::int64 coveredSamples = 0;

  for (std::size_t pointIndex = 0; pointIndex < peaks.size(); ++pointIndex) {
    const juce::int64 startSample = static_cast<juce::int64>(pointIndex)
                                    * static_cast<juce::int64>(samplesPerPoint);
    if (startSample >= totalSamples) {
      break;
    }

    const int samplesToRead = static_cast<int>(
        std::min<juce::int64>(static_cast<juce::int64>(samplesPerPoint), totalSamples - startSample));

    reader->read(&buffer, 0, samplesToRead, startSample, true, true);

    const float peak = bufferPeak(buffer, channels, samplesToRead);
    peaks[pointIndex] = std::clamp(peak, 0.0f, 1.0f);
    analysis.peakAmplitude = std::max(analysis.peakAmplitude, peak);
    coveredSamples = std::max(coveredSamples, startSample + samplesToRead);
  }

  constexpr int kTailBlockSamples = 32768;
  juce::AudioBuffer<float> tailBuffer(channels, kTailBlockSamples);
  for (juce::int64 start = coveredSamples; start < totalSamples; start += kTailBlockSamples) {
    const int samplesToRead = static_cast<int>(
        std::min<juce::int64>(kTailBlockSamples, totalSamples - start));
    reader->read(&tailBuffer, 0, samplesToRead, start, true, true);
    analysis.peakAmplitude = std::max(
        analysis.peakAmplitude,
        bufferPeak(tailBuffer, channels, samplesToRead));
  }

  peaks = normalizedWaveformPeaks(std::move(peaks));
  return analysis;
}

float computeAudioFilePeak(const juce::File& audioFile) {
  if (!audioFile.existsAsFile()) {
    return 0.0f;
  }

  juce::AudioFormatManager formatManager;
  formatManager.registerBasicFormats();
  std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(audioFile));
  if (reader == nullptr || reader->lengthInSamples <= 0 || reader->numChannels <= 0) {
    return 0.0f;
  }

  constexpr int kBlockSamples = 32768;
  const int channels = static_cast<int>(reader->numChannels);
  juce::AudioBuffer<float> buffer(channels, kBlockSamples);
  float peak = 0.0f;

  for (juce::int64 start = 0; start < reader->lengthInSamples; start += kBlockSamples) {
    const int samplesToRead = static_cast<int>(
        std::min<juce::int64>(kBlockSamples, reader->lengthInSamples - start));
    reader->read(&buffer, 0, samplesToRead, start, true, true);

    for (int channel = 0; channel < channels; ++channel) {
      const float* data = buffer.getReadPointer(channel);
      for (int sample = 0; sample < samplesToRead; ++sample) {
        peak = std::max(peak, std::abs(data[sample]));
      }
    }
  }

  return peak;
}

}  // namespace musicapp
