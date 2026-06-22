#include "ArrangementCommands.h"

#include "ArrangementCommandHelpers.h"
#include "JsonResponse.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <algorithm>
#include <atomic>
#include <memory>
#include <nlohmann/json.hpp>
#include <unordered_map>

namespace te = tracktion::engine;

namespace musicapp {
namespace {

struct FileCheck {
  bool ok = false;
  juce::File file;
  std::string code;
  std::string message;
};

tracktion::TimeDuration beatDurationAt(te::Edit& edit, double startBeat, double beats) {
  if (beats <= 0.0) {
    return {};
  }
  const auto start = te::toTime(tracktion::BeatPosition::fromBeats(startBeat), edit.tempoSequence);
  const auto end = te::toTime(tracktion::BeatPosition::fromBeats(startBeat + beats), edit.tempoSequence);
  return end - start;
}

juce::String safeCacheStem(const std::string& clipId) {
  auto stem = juce::String(clipId).retainCharacters(
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_");
  return stem.isNotEmpty() ? stem : juce::String("clip");
}

juce::File reversedCacheFile(
    const ProjectState& projectState,
    const std::string& clipId,
    const juce::File& sourceFile) {
  juce::File root(projectState.writableAssetRoot());
  auto dir = root.getChildFile("cache").getChildFile("reversed-audio");
  const auto stamp = juce::String(sourceFile.getSize())
      + "-" + juce::String(sourceFile.getLastModificationTime().toMilliseconds());
  return dir.getChildFile(safeCacheStem(clipId) + "-" + stamp + ".wav");
}

FileCheck checkAudioFile(const juce::File& file) {
  if (!file.existsAsFile() || file.getSize() <= 64) {
    return {false, file, "file_not_found", "Audio file is missing or empty."};
  }
  juce::AudioFormatManager formatManager;
  formatManager.registerBasicFormats();
  std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(file));
  if (reader == nullptr || reader->lengthInSamples <= 0 || reader->sampleRate <= 0.0) {
    return {false, file, "unsupported_file", "Audio file could not be decoded."};
  }
  return {true, file, "", ""};
}

FileCheck cachedFileCheck(
    std::unordered_map<std::string, FileCheck>& checks,
    const juce::File& file) {
  const auto key = file.getFullPathName().toStdString();
  const auto found = checks.find(key);
  if (found != checks.end()) {
    return found->second;
  }
  auto check = checkAudioFile(file);
  checks.emplace(key, check);
  return check;
}

nlohmann::json clipFailure(const std::string& clipId, const std::string& code, const std::string& message) {
  return {{"clipId", clipId}, {"ok", false}, {"errorCode", code}, {"errorMessage", message}};
}

nlohmann::json insertAudioClip(
    te::Engine& engine,
    te::Edit& edit,
    ProjectState& projectState,
    std::unordered_map<std::string, FileCheck>& checks,
    const nlohmann::json& payload) {
  if (!payload.is_object()) {
    return clipFailure("", "invalid_payload", "Expected each clip to be an object.");
  }
  const auto clipId = payload.value("clipId", std::string{});
  const auto trackId = payload.value("trackId", std::string{});
  if (clipId.empty() || trackId.empty() || !payload.contains("audioFilePath")) {
    return clipFailure(clipId, "invalid_payload", "Expected clipId, trackId, and audioFilePath.");
  }

  auto* track = trackForId(edit, projectState, trackId);
  if (track == nullptr) {
    return clipFailure(clipId, "track_not_found", "Track ID is not mapped.");
  }

  const double startBeat = payload.value("startBeat", 0.0);
  const double lengthBeats = payload.value("lengthBeats", 4.0);
  const double sourceLengthBeats = payload.value("sourceLengthBeats", lengthBeats);
  const bool isReversed = payload.value("isReversed", false);
  const double offset = std::clamp(
      payload.value("sourceOffsetBeats", 0.0), 0.0, std::max(0.0, sourceLengthBeats - lengthBeats));
  const double playOffset = isReversed
      ? std::clamp(sourceLengthBeats - offset - lengthBeats, 0.0, std::max(0.0, sourceLengthBeats - lengthBeats))
      : offset;
  auto gain = static_cast<float>(std::clamp(payload.value("clipGainDb", 0.0), -60.0, 24.0));
  double fadeIn = std::clamp(payload.value("fadeInBeats", 0.0), 0.0, lengthBeats);
  double fadeOut = std::clamp(payload.value("fadeOutBeats", 0.0), 0.0, lengthBeats);
  if (fadeIn + fadeOut > lengthBeats && fadeIn + fadeOut > 0.0) {
    const double scale = lengthBeats / (fadeIn + fadeOut);
    fadeIn *= scale;
    fadeOut *= scale;
  }

  const auto relativePath = payload["audioFilePath"].get<std::string>();
  const auto absolutePath = payload.contains("absoluteAudioFilePath")
      ? payload["absoluteAudioFilePath"].get<std::string>()
      : projectState.resolveAssetPath(relativePath);
  auto checked = cachedFileCheck(checks, juce::File(absolutePath));
  if (!checked.ok) {
    return clipFailure(clipId, checked.code, checked.message);
  }

  juce::File playbackFile(checked.file);
  if (isReversed) {
    auto reversedFile = reversedCacheFile(projectState, clipId, checked.file);
    if (!reversedFile.getParentDirectory().createDirectory()) {
      return clipFailure(clipId, "reverse_cache_failed", "Could not create reverse cache directory.");
    }
    if (!reversedFile.existsAsFile()) {
      std::atomic<float> progress{0.0f};
      if (!te::AudioFileUtils::reverse(engine, checked.file, reversedFile, progress, nullptr)) {
        return clipFailure(clipId, "reverse_render_failed", "Could not create reversed audio cache.");
      }
    }
    playbackFile = reversedFile;
  }

  removeClipGroup(projectState, clipId);
  auto waveClip = track->insertWaveClip(
      juce::String(clipId),
      playbackFile,
      beatRangeToClipPosition(edit, startBeat, lengthBeats, playOffset),
      false);
  if (waveClip == nullptr) {
    return clipFailure(clipId, "clip_insert_failed", "Audio file could not be inserted.");
  }
  waveClip->setUsesProxy(false);
  waveClip->setGainDB(gain);
  waveClip->setFadeIn(beatDurationAt(edit, startBeat, fadeIn));
  waveClip->setFadeOut(beatDurationAt(edit, startBeat + lengthBeats - fadeOut, fadeOut));
  rememberClipGroupEntries(clipId, {{"", waveClip.get()}});
  return {{"clipId", clipId}, {"trackId", trackId}, {"ok", true}, {"clipCount", 1.0}};
}

}  // namespace

CommandResult handleUpsertAudioClipsBatch(
    te::Engine& engine,
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("clips") || !payload["clips"].is_array()) {
    return makeError("upsert_audio_clips_batch", "invalid_payload", "Expected payload { clips: [] }.");
  }

  std::unordered_map<std::string, FileCheck> checks;
  nlohmann::json results = nlohmann::json::array();
  int okCount = 0;
  int failedCount = 0;
  for (const auto& clipPayload : payload["clips"]) {
    const auto result = insertAudioClip(engine, edit, projectState, checks, clipPayload);
    if (result.value("ok", false)) {
      ++okCount;
    } else {
      ++failedCount;
    }
    results.push_back(result);
  }

  nlohmann::json data;
  data["clipCount"] = static_cast<double>(okCount);
  data["failedClipCount"] = static_cast<double>(failedCount);
  data["checkedFileCount"] = static_cast<double>(checks.size());
  data["clips"] = results;
  return makeSuccess("upsert_audio_clips_batch", data.dump());
}

}  // namespace musicapp
