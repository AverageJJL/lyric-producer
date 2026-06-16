#include "ArrangementCommands.h"

#include "ArrangementCommandHelpers.h"
#include "DrumSampleDuration.h"
#include "JsonResponse.h"

#include <algorithm>
#include <cmath>
#include <nlohmann/json.hpp>
#include <utility>

namespace te = tracktion::engine;

namespace musicapp {

CommandResult handleSetDrumPatternStep(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("clipId") || !payload.contains("trackId")) {
    return makeError(
        "set_drum_pattern_step",
        "invalid_payload",
        "Expected payload with clipId, trackId, sampleKey, step, startBeat, and lengthBeats.");
  }

  const auto clipId = payload["clipId"].get<std::string>();
  const auto trackId = payload["trackId"].get<std::string>();
  const auto sampleKey = payload.value("sampleKey", std::string{"kick"});
  const int step = std::clamp(payload.value("step", 0), 0, 15);
  const bool active = payload.value("active", false);
  const double blockStartBeat = payload.value("startBeat", 0.0);
  const double blockLengthBeats = payload.value("lengthBeats", 4.0);

  auto* track = trackForId(edit, projectState, trackId);
  if (track == nullptr) {
    return makeError("set_drum_pattern_step", "track_not_found", "Track ID is not mapped.");
  }

  constexpr double kPatternBarBeats = 4.0;
  constexpr double kStepBeats = 0.25;
  const int barCount = static_cast<int>(std::ceil(blockLengthBeats / kPatternBarBeats));
  std::vector<std::string> keys;
  keys.reserve(static_cast<size_t>(std::max(0, barCount)));
  for (int bar = 0; bar < barCount; ++bar) {
    keys.push_back(sampleKey + ":" + std::to_string(bar) + ":" + std::to_string(step));
  }

  removeClipGroupEntries(clipId, keys);

  std::vector<std::pair<std::string, te::Clip*>> createdClips;
  if (active) {
    const auto samplePath = projectState.drumSamplePath(trackId, sampleKey);
    const juce::File file(samplePath);
    const double blockEndBeat = blockStartBeat + blockLengthBeats;
    if (file.existsAsFile()) {
      for (int bar = 0; bar < barCount; ++bar) {
        const double offsetInBlock = static_cast<double>(bar) * kPatternBarBeats
                                     + static_cast<double>(step) * kStepBeats;
        const double absoluteBeat = blockStartBeat + offsetInBlock;
        const double roomBeats = blockEndBeat - absoluteBeat;
        if (roomBeats <= 1e-6) {
          continue;
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
        auto waveClip =
            track->insertWaveClip(clipLabel, file, {{clipStart, clipEnd - clipStart}, {}}, false);
        if (waveClip != nullptr) {
          createdClips.push_back({keys[static_cast<size_t>(bar)], waveClip.get()});
        }
      }
    }
  }

  const auto clipCount = createdClips.size();
  appendClipGroupEntries(clipId, std::move(createdClips));

  nlohmann::json data;
  data["clipId"] = clipId;
  data["trackId"] = trackId;
  data["sampleKey"] = sampleKey;
  data["step"] = step;
  data["active"] = active;
  data["clipCount"] = static_cast<double>(clipCount);
  return makeSuccess("set_drum_pattern_step", data.dump());
}

}  // namespace musicapp
