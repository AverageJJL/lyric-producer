#include "ArrangementCommands.h"

#include "ArrangementCommandHelpers.h"
#include "DrumSampleDuration.h"
#include "JsonResponse.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <algorithm>
#include <atomic>
#include <cmath>
#include <nlohmann/json.hpp>
#include <utility>

namespace te = tracktion::engine;

namespace musicapp {
namespace {

tracktion::TimeDuration beatDurationAt(
    te::Edit& edit,
    double startBeat,
    double durationBeats) {
  if (durationBeats <= 0.0) {
    return {};
  }

  const auto start =
      te::toTime(tracktion::BeatPosition::fromBeats(startBeat), edit.tempoSequence);
  const auto end = te::toTime(
      tracktion::BeatPosition::fromBeats(startBeat + durationBeats),
      edit.tempoSequence);
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
  juce::File cacheRoot(projectState.writableAssetRoot());
  auto cacheDir = cacheRoot.getChildFile("cache").getChildFile("reversed-audio");
  const auto stamp = juce::String(sourceFile.getSize())
      + "-" + juce::String(sourceFile.getLastModificationTime().toMilliseconds());
  return cacheDir.getChildFile(safeCacheStem(clipId) + "-" + stamp + ".wav");
}

}  // namespace

CommandResult handleUpsertAudioClip(
    te::Engine& engine,
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("clipId") || !payload.contains("trackId")) {
    return makeError(
        "upsert_audio_clip",
        "invalid_payload",
        "Expected payload with clipId, trackId, startBeat, lengthBeats, drumHits.");
  }

  const auto clipId = payload["clipId"].get<std::string>();
  const auto trackId = payload["trackId"].get<std::string>();
  const double blockStartBeat = payload.value("startBeat", 0.0);
  const double blockLengthBeats = payload.value("lengthBeats", 4.0);
  const double sourceLengthBeats = payload.value("sourceLengthBeats", blockLengthBeats);
  const bool isReversed = payload.value("isReversed", false);
  const double sourceOffsetBeats = std::clamp(
      payload.value("sourceOffsetBeats", 0.0),
      0.0,
      std::max(0.0, sourceLengthBeats - blockLengthBeats));
  const double playbackSourceOffsetBeats = isReversed
      ? std::clamp(
            sourceLengthBeats - sourceOffsetBeats - blockLengthBeats,
            0.0,
            std::max(0.0, sourceLengthBeats - blockLengthBeats))
      : sourceOffsetBeats;
  const auto clipGainDb = static_cast<float>(
      std::clamp(payload.value("clipGainDb", 0.0), -60.0, 24.0));
  double fadeInBeats = std::clamp(payload.value("fadeInBeats", 0.0), 0.0, blockLengthBeats);
  double fadeOutBeats = std::clamp(payload.value("fadeOutBeats", 0.0), 0.0, blockLengthBeats);
  if (fadeInBeats + fadeOutBeats > blockLengthBeats && fadeInBeats + fadeOutBeats > 0.0) {
    const double scale = blockLengthBeats / (fadeInBeats + fadeOutBeats);
    fadeInBeats *= scale;
    fadeOutBeats *= scale;
  }

  auto* track = trackForId(edit, projectState, trackId);
  if (track == nullptr) {
    return makeError("upsert_audio_clip", "track_not_found", "Track ID is not mapped.");
  }

  if (hasClipGroup(clipId)) {
    removeClipGroup(projectState, clipId);
  }

  std::vector<std::pair<std::string, te::Clip*>> createdClips;

  if (payload.contains("audioFilePath")) {
    const auto relativePath = payload["audioFilePath"].get<std::string>();
    const auto absolutePath = payload.contains("absoluteAudioFilePath")
                                  ? payload["absoluteAudioFilePath"].get<std::string>()
                                  : projectState.resolveAssetPath(relativePath);
    const juce::File file(absolutePath);
    if (!file.existsAsFile() || file.getSize() <= 64) {
      return makeError("upsert_audio_clip", "file_not_found", "Audio file is missing or empty.");
    }

    juce::AudioFormatManager formatManager;
    formatManager.registerBasicFormats();
    std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(file));
    if (reader == nullptr || reader->lengthInSamples <= 0 || reader->sampleRate <= 0.0) {
      return makeError("upsert_audio_clip", "unsupported_file", "Audio file could not be decoded.");
    }
    reader.reset();

    juce::File playbackFile(file);
    if (isReversed) {
      auto reversedFile = reversedCacheFile(projectState, clipId, file);
      if (!reversedFile.getParentDirectory().createDirectory()) {
        return makeError("upsert_audio_clip", "reverse_cache_failed", "Could not create reverse cache directory.");
      }
      if (!reversedFile.existsAsFile()) {
        std::atomic<float> progress{0.0f};
        if (!te::AudioFileUtils::reverse(engine, file, reversedFile, progress, nullptr)) {
          return makeError("upsert_audio_clip", "reverse_render_failed", "Could not create reversed audio cache.");
        }
      }
      playbackFile = reversedFile;
    }

    auto waveClip = track->insertWaveClip(
        juce::String(clipId),
        playbackFile,
        beatRangeToClipPosition(edit, blockStartBeat, blockLengthBeats, playbackSourceOffsetBeats),
        false);
    if (waveClip == nullptr) {
      return makeError("upsert_audio_clip", "clip_insert_failed", "Audio file could not be inserted.");
    }

    // The Electron main thread also hosts JUCE's message pump in dev. Tracktion's
    // async proxy generation can block that thread waiting for itself, so runtime
    // DAW clips play directly from their validated source files.
    waveClip->setUsesProxy(false);
    waveClip->setGainDB(clipGainDb);
    waveClip->setFadeIn(beatDurationAt(edit, blockStartBeat, fadeInBeats));
    waveClip->setFadeOut(beatDurationAt(
        edit,
        blockStartBeat + blockLengthBeats - fadeOutBeats,
        fadeOutBeats));
    createdClips.push_back({"", waveClip.get()});
  }

  const auto placeDrumHitAtBeat =
      [&](const std::string& sampleKey, double absoluteBeat, const std::string& clipKey) {
    const auto samplePath = projectState.drumSamplePath(trackId, sampleKey);
    if (samplePath.empty()) {
      return;
    }

    const juce::File file(samplePath);
    const double blockEndBeat = blockStartBeat + blockLengthBeats;
    const double roomBeats = blockEndBeat - absoluteBeat;
    if (!file.existsAsFile() || roomBeats <= 1e-6) {
      return;
    }

    const double clipDurationBeats = std::min(
        drumClipDurationBeats(file, edit.tempoSequence),
        roomBeats);
    const auto clipStart = te::toTime(
        tracktion::BeatPosition::fromBeats(absoluteBeat),
        edit.tempoSequence);
    const auto clipEnd = te::toTime(
        tracktion::BeatPosition::fromBeats(absoluteBeat + clipDurationBeats),
        edit.tempoSequence);
    const juce::String clipLabel =
        juce::String(clipId) + "-" + sampleKey + "-" + juce::String(absoluteBeat);

    auto waveClip = track->insertWaveClip(clipLabel, file, {{clipStart, clipEnd - clipStart}, {}}, false);
    if (waveClip != nullptr) {
      waveClip->setUsesProxy(false);
      createdClips.push_back({clipKey, waveClip.get()});
    }
  };

  if (payload.contains("lanes") && payload["lanes"].is_object()) {
    constexpr double kPatternBarBeats = 4.0;
    constexpr double kStepBeats = 0.25;
    const int barCount = static_cast<int>(std::ceil(blockLengthBeats / kPatternBarBeats));
    for (int bar = 0; bar < barCount; ++bar) {
      for (const auto& [sampleKey, stepsJson] : payload["lanes"].items()) {
        if (!stepsJson.is_array()) {
          continue;
        }
        for (const auto& stepVal : stepsJson) {
          const int step = stepVal.get<int>();
          const double offsetInBlock = static_cast<double>(bar) * kPatternBarBeats
                                       + static_cast<double>(step) * kStepBeats;
          if (offsetInBlock < blockLengthBeats - 1e-6) {
            placeDrumHitAtBeat(
                sampleKey,
                blockStartBeat + offsetInBlock,
                sampleKey + ":" + std::to_string(bar) + ":" + std::to_string(step));
          }
        }
      }
    }
  } else if (payload.contains("drumHits") && payload["drumHits"].is_array()) {
    for (const auto& hit : payload["drumHits"]) {
      const int step = hit.value("step", 0);
      placeDrumHitAtBeat(
          hit.value("sampleKey", std::string{"kick"}),
          blockStartBeat + static_cast<double>(step) * 0.25,
          hit.value("sampleKey", std::string{"kick"}) + ":0:" + std::to_string(step));
    }
  }

  const auto clipCount = createdClips.size();
  rememberClipGroupEntries(clipId, std::move(createdClips));

  nlohmann::json data;
  data["clipId"] = clipId;
  data["trackId"] = trackId;
  data["clipCount"] = static_cast<double>(clipCount);
  return makeSuccess("upsert_audio_clip", data.dump());
}

}  // namespace musicapp
