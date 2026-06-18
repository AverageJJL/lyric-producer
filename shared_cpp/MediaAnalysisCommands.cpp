#include "MediaAnalysisCommands.h"

#include "JsonResponse.h"
#include "TempoSequenceTime.h"
#include "WaveformPeaks.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <cmath>
#include <vector>

namespace te = tracktion::engine;

namespace musicapp {

namespace {

double baseBpmForMetadata(const te::Edit& edit) {
  if (edit.tempoSequence.getTempos().isEmpty()) {
    return 120.0;
  }

  const double bpm = edit.tempoSequence.getTempos()[0]->getBpm();
  return bpm > 0.0 ? bpm : 120.0;
}

struct TransientHit {
  double seconds = 0.0;
  float level = 0.0f;
};

int boundedInt(const nlohmann::json& payload, const char* key, int fallback, int min, int max) {
  const int value = payload.value(key, fallback);
  return std::clamp(value, min, max);
}

double boundedDouble(
    const nlohmann::json& payload,
    const char* key,
    double fallback,
    double min,
    double max) {
  const double value = payload.value(key, fallback);
  return std::clamp(value, min, max);
}

std::vector<TransientHit> detectTransientHits(
    juce::AudioFormatReader& reader,
    int maxSlices,
    double threshold,
    double minGapSeconds) {
  constexpr int windowSize = 1024;
  const int channels = std::max(1, std::min<int>(2, static_cast<int>(reader.numChannels)));
  juce::AudioBuffer<float> buffer(channels, windowSize);
  std::vector<TransientHit> hits;
  double previousRms = 0.0;
  double lastHitSeconds = -minGapSeconds;

  for (juce::int64 start = 0; start < reader.lengthInSamples && hits.size() < static_cast<size_t>(maxSlices);
       start += windowSize) {
    const int samples = static_cast<int>(
        std::min<juce::int64>(windowSize, reader.lengthInSamples - start));
    buffer.clear();
    if (!reader.read(&buffer, 0, samples, start, true, true)) {
      continue;
    }

    double sumSquares = 0.0;
    float peak = 0.0f;
    for (int channel = 0; channel < channels; ++channel) {
      for (int sample = 0; sample < samples; ++sample) {
        const float value = std::abs(buffer.getSample(channel, sample));
        peak = std::max(peak, value);
        sumSquares += static_cast<double>(value) * static_cast<double>(value);
      }
    }
    const double rms = std::sqrt(sumSquares / std::max(1, samples * channels));
    const double seconds = static_cast<double>(start) / reader.sampleRate;
    const bool separated = seconds - lastHitSeconds >= minGapSeconds;
    const bool onset = rms >= threshold && (previousRms <= 0.000001 || rms >= previousRms * 1.55);
    if (separated && onset) {
      hits.push_back({seconds, peak});
      lastHitSeconds = seconds;
    }
    previousRms = std::max(previousRms * 0.65, rms);
  }

  if (hits.empty() && reader.lengthInSamples > 0) {
    hits.push_back({0.0, 0.8f});
  }
  return hits;
}

}  // namespace

CommandResult handleAnalyzeAudioFile(te::Edit& edit, const std::string& payloadJson) {
  const nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("absoluteAudioFilePath")
      || !payload["absoluteAudioFilePath"].is_string()) {
    return makeError(
        "analyze_audio_file",
        "invalid_payload",
        "Expected payload { \"absoluteAudioFilePath\": string }.");
  }

  const juce::File file(payload["absoluteAudioFilePath"].get<std::string>());
  if (!file.existsAsFile() || file.getSize() <= 64) {
    return makeError("analyze_audio_file", "file_not_found", "Audio file is missing or empty.");
  }

  juce::AudioFormatManager formatManager;
  formatManager.registerBasicFormats();
  std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(file));
  if (reader == nullptr || reader->lengthInSamples <= 0 || reader->sampleRate <= 0.0) {
    return makeError("analyze_audio_file", "unsupported_file", "Audio file could not be decoded.");
  }

  const double durationSeconds =
      static_cast<double>(reader->lengthInSamples) / static_cast<double>(reader->sampleRate);
  const double lengthBeats =
      std::max(1.0, secondsToBeatsFromStart(edit.tempoSequence, durationSeconds));
  const auto peakAnalysis = computeWaveformPeakAnalysis(
      file,
      peakCountForDuration(durationSeconds));

  nlohmann::json peakArray = nlohmann::json::array();
  for (float peak : peakAnalysis.waveformPeaks) {
    peakArray.push_back(peak);
  }

  nlohmann::json data;
  data["absoluteAudioFilePath"] = file.getFullPathName().toStdString();
  data["durationSeconds"] = durationSeconds;
  data["lengthBeats"] = lengthBeats;
  data["sampleRate"] = reader->sampleRate;
  data["channelCount"] = reader->numChannels;
  data["fileBytes"] = file.getSize();
  data["peakAmplitude"] = peakAnalysis.peakAmplitude;
  data["waveformPeaks"] = peakArray;
  return makeSuccess("analyze_audio_file", data.dump());
}

CommandResult handleDetectAudioTransients(te::Edit& edit, const std::string& payloadJson) {
  const nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("absoluteAudioFilePath")
      || !payload["absoluteAudioFilePath"].is_string()) {
    return makeError(
        "detect_audio_transients",
        "invalid_payload",
        "Expected payload { \"absoluteAudioFilePath\": string }.");
  }

  const juce::File file(payload["absoluteAudioFilePath"].get<std::string>());
  if (!file.existsAsFile() || file.getSize() <= 64) {
    return makeError("detect_audio_transients", "file_not_found", "Audio file is missing or empty.");
  }

  juce::AudioFormatManager formatManager;
  formatManager.registerBasicFormats();
  std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(file));
  if (reader == nullptr || reader->lengthInSamples <= 0 || reader->sampleRate <= 0.0) {
    return makeError("detect_audio_transients", "unsupported_file", "Audio file could not be decoded.");
  }

  const int maxSlices = boundedInt(payload, "maxSlices", 16, 1, 64);
  const double threshold = boundedDouble(payload, "threshold", 0.08, 0.001, 1.0);
  const double minGapSeconds = boundedDouble(payload, "minGapSeconds", 0.08, 0.01, 2.0);
  const double minSliceSeconds = boundedDouble(payload, "minSliceSeconds", 0.05, 0.01, 4.0);
  const double maxSliceSeconds = boundedDouble(payload, "maxSliceSeconds", 2.0, minSliceSeconds, 16.0);
  const double bpm = baseBpmForMetadata(edit);
  const double durationSeconds =
      static_cast<double>(reader->lengthInSamples) / static_cast<double>(reader->sampleRate);
  const auto hits = detectTransientHits(*reader, maxSlices, threshold, minGapSeconds);

  nlohmann::json slices = nlohmann::json::array();
  for (size_t index = 0; index < hits.size(); ++index) {
    const double startSeconds = hits[index].seconds;
    const double nextSeconds = index + 1 < hits.size() ? hits[index + 1].seconds : durationSeconds;
    const double lengthSeconds = std::clamp(nextSeconds - startSeconds, minSliceSeconds, maxSliceSeconds);
    const double sourceStartBeat = secondsToBeatsFromStart(edit.tempoSequence, startSeconds);
    const int velocity = std::clamp(static_cast<int>(std::round(40.0 + hits[index].level * 87.0)), 1, 127);
    slices.push_back({
        {"name", "Slice " + std::to_string(index + 1)},
        {"sourceStartSeconds", startSeconds},
        {"sourceLengthSeconds", lengthSeconds},
        {"sourceStartBeat", sourceStartBeat},
        {"sourceLengthBeats", std::max(
                                  0.000001,
                                  beatDurationForSecondsAtBeat(
                                      edit.tempoSequence,
                                      sourceStartBeat,
                                      lengthSeconds))},
        {"triggerNote", std::min(127, 48 + static_cast<int>(index))},
        {"velocity", velocity},
        {"clipStartBeat", static_cast<double>(index)},
    });
  }

  nlohmann::json data;
  data["absoluteAudioFilePath"] = file.getFullPathName().toStdString();
  data["durationSeconds"] = durationSeconds;
  data["bpm"] = bpm;
  data["slices"] = slices;
  return makeSuccess("detect_audio_transients", data.dump());
}

}  // namespace musicapp
