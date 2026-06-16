#pragma once

#include <juce_core/juce_core.h>

#include <string>
#include <vector>

namespace musicapp {

struct AudioFilePeakAnalysis {
  std::vector<float> waveformPeaks;
  float peakAmplitude = 0.0f;
};

/** Downsample a WAV/file to normalized peak heights for timeline drawing. */
std::vector<float> computeWaveformPeaks(const juce::File& audioFile, int pointCount = 128);

/** Downsample waveform peaks and collect the full-file absolute peak in one reader pass. */
AudioFilePeakAnalysis computeWaveformPeakAnalysis(
    const juce::File& audioFile,
    int pointCount = 128);

/** Full-file absolute peak for gain normalization; unlike waveform peaks this is not normalized. */
float computeAudioFilePeak(const juce::File& audioFile);

/** Duration-aware peak count for final clip waveform (bounded for IPC). */
int peakCountForDuration(double durationSeconds);

}  // namespace musicapp
