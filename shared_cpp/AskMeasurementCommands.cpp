#include "AskMeasurementCommands.h"

#include "ArrangementCommandHelpers.h"
#include "AskMeasurementDsp.h"
#include "JsonResponse.h"
#include "ProjectState.h"

#include <juce_core/juce_core.h>
#include <nlohmann/json.hpp>
#include <tracktion_engine/tracktion_engine.h>

#include <algorithm>
#include <cmath>
#include <string>

namespace te = tracktion::engine;

namespace musicapp {

namespace {

bool isSafeRelativeAudioPath(const std::string& path) {
  if (path.empty() || path[0] == '/' || path[0] == '\\') {
    return false;
  }
  return path.find("..") == std::string::npos;
}

juce::File resolveExistingAudio(const ProjectState& projectState, const std::string& audioPath, bool& ok) {
  ok = false;
  if (!isSafeRelativeAudioPath(audioPath)) {
    return juce::File();
  }
  const juce::File file(projectState.resolveAssetPath(audioPath));
  if (!file.existsAsFile() || file.getSize() <= 64) {
    return juce::File();
  }
  ok = true;
  return file;
}

double finiteOr(const nlohmann::json& payload, const char* key, double fallback) {
  const auto it = payload.find(key);
  if (it == payload.end() || !it->is_number()) {
    return fallback;
  }
  const double value = it->get<double>();
  return std::isfinite(value) ? value : fallback;
}

bool boolOr(const nlohmann::json& payload, const char* key, bool fallback) {
  const auto it = payload.find(key);
  return it != payload.end() && it->is_boolean() ? it->get<bool>() : fallback;
}

/**
 * Convert the clip's beat geometry into the source-seconds window to decode, using the
 * SAME tempo sequence + ClipPosition math the engine uses to place the clip
 * (ArrangementAudioCommands::upsert_audio_clip). This keeps Ask aligned with playback
 * under tempo maps. Without startBeat/lengthBeats we measure the whole file.
 *
 * The original-file region [sourceOffsetBeats, +lengthBeats] is what is audible for BOTH
 * forward and reversed clips (reversed playback mirrors the offset into a reversed cache
 * of that same region), so we read the original here and let the DSP reverse it and apply
 * the fades on the audible timeline.
 */
AskSegmentRequest segmentFromPayload(te::Edit& edit, const nlohmann::json& payload) {
  AskSegmentRequest request;
  request.gainDb = finiteOr(payload, "clipGainDb", finiteOr(payload, "gainDb", 0.0));
  request.reversed = boolOr(payload, "isReversed", false);

  const auto startBeatIt = payload.find("startBeat");
  const auto lengthBeatsIt = payload.find("lengthBeats");
  if (startBeatIt == payload.end() || lengthBeatsIt == payload.end()
      || !startBeatIt->is_number() || !lengthBeatsIt->is_number()) {
    return request;  // whole file (durationSeconds 0)
  }

  const double startBeat = startBeatIt->get<double>();
  const double lengthBeats = std::max(0.0, lengthBeatsIt->get<double>());
  const double sourceLengthBeats = std::max(lengthBeats, finiteOr(payload, "sourceLengthBeats", lengthBeats));
  const double sourceOffsetBeats = std::clamp(
      finiteOr(payload, "sourceOffsetBeats", 0.0), 0.0, std::max(0.0, sourceLengthBeats - lengthBeats));

  const te::ClipPosition position = beatRangeToClipPosition(edit, startBeat, lengthBeats, sourceOffsetBeats);
  request.startSeconds = std::max(0.0, position.getOffset().inSeconds());
  request.durationSeconds = lengthBeats > 0.0 ? position.getLength().inSeconds() : 0.0;

  double fadeInBeats = std::clamp(finiteOr(payload, "fadeInBeats", 0.0), 0.0, lengthBeats);
  double fadeOutBeats = std::clamp(finiteOr(payload, "fadeOutBeats", 0.0), 0.0, lengthBeats);
  if (fadeInBeats + fadeOutBeats > lengthBeats && fadeInBeats + fadeOutBeats > 0.0) {
    const double scale = lengthBeats / (fadeInBeats + fadeOutBeats);
    fadeInBeats *= scale;
    fadeOutBeats *= scale;
  }
  request.fadeInSeconds = beatRangeToTimeRange(edit, startBeat, fadeInBeats).getLength().inSeconds();
  request.fadeOutSeconds =
      beatRangeToTimeRange(edit, startBeat + lengthBeats - fadeOutBeats, fadeOutBeats).getLength().inSeconds();
  return request;
}

/** Validate { audioPath } and resolve it; on failure returns an error CommandResult. */
bool resolveAudioPayload(
    const char* command,
    const ProjectState& projectState,
    const std::string& payloadJson,
    nlohmann::json& payloadOut,
    juce::File& fileOut,
    CommandResult& errorOut) {
  payloadOut = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payloadOut.is_discarded() || !payloadOut.contains("audioPath") || !payloadOut["audioPath"].is_string()) {
    errorOut = makeError(command, "invalid_payload", "Expected payload { \"audioPath\": string }.");
    return false;
  }
  bool ok = false;
  fileOut = resolveExistingAudio(projectState, payloadOut["audioPath"].get<std::string>(), ok);
  if (!ok) {
    errorOut = makeError(command, "audio_not_found", "Audio file is missing or path is unsafe.");
    return false;
  }
  return true;
}

}  // namespace

CommandResult handleMeasureLoudness(
    te::Edit& edit, const ProjectState& projectState, const std::string& payloadJson) {
  nlohmann::json payload;
  juce::File file;
  CommandResult error;
  if (!resolveAudioPayload("measure_loudness", projectState, payloadJson, payload, file, error)) {
    return error;
  }

  const AskAudioSegment segment = readAudioSegment(file, segmentFromPayload(edit, payload));
  if (!segment.ok || segment.channels.empty() || segment.sampleRate <= 0.0) {
    return makeError("measure_loudness", "unsupported_file", "Audio segment could not be decoded.");
  }

  const std::vector<double> squares = kWeightedChannelSquares(segment.channels, segment.sampleRate);
  const double rms = channelRms(segment.channels);
  const double frames = static_cast<double>(segment.channels.front().size());

  nlohmann::json data;
  data["audioPath"] = payload["audioPath"].get<std::string>();
  data["durationSeconds"] = frames / segment.sampleRate;
  data["sampleRate"] = segment.sampleRate;
  data["channelCount"] = static_cast<int>(segment.channels.size());
  data["integratedLufs"] = integratedLufs(squares);
  data["shortTermLufs"] = loudestWindow(squares, 144000);  // 3 s
  data["momentaryLufs"] = loudestWindow(squares, 19200);   // 400 ms
  data["rmsDb"] = askAmpToDb(rms);
  data["peakDb"] = askAmpToDb(segment.peak);
  return makeSuccess("measure_loudness", data.dump());
}

CommandResult handleGetSpectrumBands(
    te::Edit& edit, const ProjectState& projectState, const std::string& payloadJson) {
  nlohmann::json payload;
  juce::File file;
  CommandResult error;
  if (!resolveAudioPayload("get_spectrum_bands", projectState, payloadJson, payload, file, error)) {
    return error;
  }
  const bool loudnessMatch = payload.value("loudnessMatch", false);

  const AskAudioSegment segment = readAudioSegment(file, segmentFromPayload(edit, payload));
  if (!segment.ok || segment.channels.empty() || segment.sampleRate <= 0.0) {
    return makeError("get_spectrum_bands", "unsupported_file", "Audio segment could not be decoded.");
  }

  const std::vector<AskBandEdge> bands = buildBands(segment.sampleRate);
  const AskSpectrum spectrum = computeBandSpectrum(segment.channels, segment.sampleRate, bands);

  double meanOfBands = 0.0;
  for (double energy : spectrum.meanEnergy) {
    meanOfBands += energy;
  }
  meanOfBands = bands.empty() ? 1.0 : std::max(1.0e-12, meanOfBands / static_cast<double>(bands.size()));

  nlohmann::json bandArray = nlohmann::json::array();
  for (std::size_t b = 0; b < bands.size(); ++b) {
    // loudnessMatch reports each band relative to this segment's average band level, so two
    // segments can be compared by spectral shape independent of overall level.
    const double energyDb = loudnessMatch
        ? askLinToDb(spectrum.meanEnergy[b]) - askLinToDb(meanOfBands)
        : askLinToDb(spectrum.meanEnergy[b]);
    bandArray.push_back({{"lowHz", bands[b].lowHz}, {"highHz", bands[b].highHz}, {"energyDb", energyDb}});
  }

  nlohmann::json data;
  data["audioPath"] = payload["audioPath"].get<std::string>();
  data["sampleRate"] = segment.sampleRate;
  data["channelCount"] = static_cast<int>(segment.channels.size());
  data["loudnessMatched"] = loudnessMatch;
  data["integratedRmsDb"] = spectrum.integratedRmsDb;
  data["bands"] = bandArray;
  return makeSuccess("get_spectrum_bands", data.dump());
}

}  // namespace musicapp
