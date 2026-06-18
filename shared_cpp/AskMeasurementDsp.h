#pragma once

#include <cstddef>
#include <vector>

namespace juce {
class File;
}

namespace musicapp {

/**
 * Pure DSP helpers for the read-only Ask audio measurements (electron/askAudioTools.ts ->
 * measure_loudness / get_spectrum_bands). Split out of AskMeasurementCommands.cpp so each
 * file stays under the repo line budget and the DSP is independently testable.
 *
 * Measurements are taken PER CHANNEL and combined by energy (peak = max across channels,
 * loudness = BS.1770 channel-summed squares, spectrum = channel-summed band power), so
 * hard-panned or out-of-phase stereo is never cancelled by averaging samples to mono.
 */

inline constexpr double kAskSilenceDb = -120.0;

double askLinToDb(double value);
double askAmpToDb(double amp);

/** The audible source window to decode: a trim into the file with gain + linear fades. */
struct AskSegmentRequest {
  double startSeconds = 0.0;
  double durationSeconds = 0.0;  // <= 0 → decode to the end of the file
  double gainDb = 0.0;
  double fadeInSeconds = 0.0;
  double fadeOutSeconds = 0.0;
  bool reversed = false;
};

/** Decoded per-channel samples (source rate) after trim/gain/fade, plus the true peak. */
struct AskAudioSegment {
  std::vector<std::vector<float>> channels;
  double sampleRate = 0.0;
  double peak = 0.0;  // max |sample| across all channels
  bool ok = false;
};

AskAudioSegment readAudioSegment(const juce::File& file, const AskSegmentRequest& request);

/** RMS amplitude from the average of per-channel mean-squares (energy combine, no cancel). */
double channelRms(const std::vector<std::vector<float>>& channels);

/** Channel-summed K-weighted per-sample squares at 48 kHz (BS.1770, channel weights 1.0). */
std::vector<double> kWeightedChannelSquares(const std::vector<std::vector<float>>& channels, double sampleRate);

double integratedLufs(const std::vector<double>& squares);
double loudestWindow(const std::vector<double>& squares, std::size_t windowSamples);

struct AskBandEdge {
  double lowHz;
  double highHz;
};

std::vector<AskBandEdge> buildBands(double sampleRate);

struct AskSpectrum {
  std::vector<double> meanEnergy;  // per band: channel-summed power, mean over frames
  double integratedRmsDb = kAskSilenceDb;
  int frames = 0;
};

AskSpectrum computeBandSpectrum(
    const std::vector<std::vector<float>>& channels,
    double sampleRate,
    const std::vector<AskBandEdge>& bands);

}  // namespace musicapp
