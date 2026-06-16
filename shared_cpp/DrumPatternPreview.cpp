#include "DrumPatternPreview.h"

#include "JsonResponse.h"
#include "SampleOneShotPlayer.h"
#include "TempoSequenceTime.h"

#include <atomic>
#include <chrono>
#include <cmath>
#include <nlohmann/json.hpp>
#include <thread>
#include <tracktion_engine/tracktion_engine.h>
#include <unordered_map>
#include <utility>
#include <vector>

namespace te = tracktion::engine;

namespace musicapp {

using LaneSteps = std::unordered_map<std::string, std::vector<int>>;

struct PatternPreviewSession {
  bool active = false;
  std::string trackId;
  double bpm = 120.0;
  LaneSteps lanes;
  int lastEmittedStep = -1;
  double savedRestoreBeat = 0.0;
};

PatternPreviewSession previewSession;
te::Edit* previewEdit = nullptr;
ProjectState* previewProjectState = nullptr;
EngineEventEmitter previewEmitEvent;

namespace {

tracktion::TimeRange previewLoopTimeRange(te::Edit& edit) {
  const auto start = te::toTime(
      tracktion::BeatPosition::fromBeats(kDrumPreviewRegionStartBeat),
      edit.tempoSequence);
  const auto end = te::toTime(
      tracktion::BeatPosition::fromBeats(kDrumPreviewRegionStartBeat + kPreviewPatternBeats),
      edit.tempoSequence);
  return {start, end - start};
}

te::AudioTrack* previewTrackForSession(te::Edit& edit, ProjectState& projectState) {
  const int index = projectState.trackIndexForId(previewSession.trackId);
  if (index < 0) {
    return nullptr;
  }
  const auto tracks = te::getAudioTracks(edit);
  if (index >= tracks.size()) {
    return nullptr;
  }
  return tracks[index];
}

void rebuildPatternPreviewClips(te::Edit& edit, ProjectState& projectState) {
  auto* track = previewTrackForSession(edit, projectState);
  if (track == nullptr) {
    return;
  }

  clearPreviewClipsOnTrack(*track);

  for (const auto& [sampleKey, steps] : previewSession.lanes) {
    for (const int step : steps) {
      if (step < 0 || step > 15) {
        continue;
      }
      const double beat =
          kDrumPreviewRegionStartBeat + static_cast<double>(step) * kPreviewStepSpacingBeats;
      insertDrumPreviewClip(edit, projectState, previewSession.trackId, sampleKey, step, beat);
    }
  }
}

double readTransportBeat(te::Edit& edit) {
  const auto& transport = edit.getTransport();
  return beatAtSeconds(edit.tempoSequence, transport.getPosition().inSeconds());
}

int stepIndexFromPreviewBeat(const double beat) {
  double offset = beat - kDrumPreviewRegionStartBeat;
  if (offset < 0.0) {
    offset = std::fmod(offset, kPreviewPatternBeats) + kPreviewPatternBeats;
  } else if (offset >= kPreviewPatternBeats) {
    offset = std::fmod(offset, kPreviewPatternBeats);
  }

  const int step = static_cast<int>(std::floor(offset / kPreviewStepSpacingBeats + 1e-9));
  return ((step % 16) + 16) % 16;
}

void emitPatternPreviewStep(const int step) {
  if (!previewEmitEvent) {
    return;
  }

  nlohmann::json payload;
  payload["step"] = step;
  payload["event"] = "drumPatternStep";
  previewEmitEvent("onDrumPatternStep", payload.dump());
}

void onPatternPreviewTimerTick() {
  if (!previewSession.active || previewEdit == nullptr) {
    return;
  }

  const int step = stepIndexFromPreviewBeat(readTransportBeat(*previewEdit));
  if (step == previewSession.lastEmittedStep) {
    return;
  }

  previewSession.lastEmittedStep = step;
  emitPatternPreviewStep(step);
}

std::atomic<bool>& previewTimerRunning() {
  static std::atomic<bool> running{false};
  return running;
}

std::thread& previewTimerThread() {
  static std::thread thread;
  return thread;
}

void stopPreviewTimer() {
  auto& running = previewTimerRunning();
  if (!running.exchange(false)) {
    return;
  }

  auto& thread = previewTimerThread();
  if (thread.joinable()) {
    thread.join();
  }
}

void applyPreviewTimerInterval(EngineTaskPoster postToEngineThread) {
  // Poll transport so UI playhead tracks audio (not an open-loop BPM timer).
  auto& running = previewTimerRunning();
  if (running.exchange(true)) {
    return;
  }

  previewTimerThread() = std::thread([postToEngineThread = std::move(postToEngineThread)] {
    while (previewTimerRunning()) {
      std::this_thread::sleep_for(std::chrono::milliseconds(20));
      if (previewTimerRunning()) {
        postToEngineThread([] { onPatternPreviewTimerTick(); });
      }
    }
  });
}

LaneSteps parseLanes(const nlohmann::json& payload) {
  LaneSteps lanes;
  if (!payload.contains("lanes") || !payload["lanes"].is_object()) {
    return lanes;
  }

  for (const auto& [key, value] : payload["lanes"].items()) {
    if (!value.is_array()) {
      continue;
    }
    std::vector<int> steps;
    for (const auto& stepVal : value) {
      steps.push_back(stepVal.get<int>());
    }
    lanes[key] = std::move(steps);
  }

  return lanes;
}

}  // namespace

bool isDrumPatternPreviewActive() {
  return previewSession.active;
}

CommandResult handleStartPatternPreview(
    te::Engine& engine,
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson,
    const EngineEventEmitter& emitEvent,
    EngineTaskPoster postToEngineThread) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId")) {
    return makeError(
        "start_pattern_preview",
        "invalid_payload",
        "Expected payload { trackId, bpm?, lanes }.");
  }

  previewSession = {};
  previewSession.active = true;
  previewSession.trackId = payload["trackId"].get<std::string>();
  previewSession.bpm = payload.value("bpm", 120.0);
  previewSession.lanes = parseLanes(payload);
  previewSession.lastEmittedStep = -1;
  {
    const auto& transport = edit.getTransport();
    const double positionSeconds = transport.getPosition().inSeconds();
    const double beat = beatAtSeconds(edit.tempoSequence, positionSeconds);
    previewSession.savedRestoreBeat =
        beat < kDrumPreviewRegionStartBeat - 1.0 ? beat : 0.0;
  }

  previewEdit = &edit;
  previewProjectState = &projectState;
  previewEmitEvent = emitEvent;

  auto& transport = edit.getTransport();
  transport.ensureContextAllocated();
  rebuildPatternPreviewClips(edit, projectState);
  transport.setLoopRange(previewLoopTimeRange(edit));
  transport.looping = true;
  transport.setPosition(te::toTime(
      tracktion::BeatPosition::fromBeats(kDrumPreviewRegionStartBeat),
      edit.tempoSequence));
  transport.play(false);
  previewSession.lastEmittedStep = stepIndexFromPreviewBeat(kDrumPreviewRegionStartBeat);
  emitPatternPreviewStep(previewSession.lastEmittedStep);
  applyPreviewTimerInterval(std::move(postToEngineThread));

  nlohmann::json data;
  data["trackId"] = previewSession.trackId;
  data["bpm"] = previewSession.bpm;
  return makeSuccess("start_pattern_preview", data.dump());
}

CommandResult handleUpdatePatternPreview(const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded()) {
    return makeError("update_pattern_preview", "invalid_payload", "Expected JSON object.");
  }

  if (payload.contains("bpm")) {
    previewSession.bpm = payload["bpm"].get<double>();
  }

  if (payload.contains("lanes")) {
    previewSession.lanes = parseLanes(payload);
    if (previewEdit != nullptr && previewProjectState != nullptr) {
      rebuildPatternPreviewClips(*previewEdit, *previewProjectState);
    }
  }

  return makeSuccess("update_pattern_preview", "{}");
}

CommandResult handleStopPatternPreview() {
  stopPreviewTimer();

  const double restoreBeat = previewSession.savedRestoreBeat;

  if (previewEdit != nullptr && previewSession.active) {
    restoreLinearTransport(*previewEdit, restoreBeat);
  }

  if (previewEdit != nullptr && previewProjectState != nullptr && previewSession.active) {
    if (auto* track = [&]() -> te::AudioTrack* {
          const int index =
              previewProjectState->trackIndexForId(previewSession.trackId);
          if (index < 0) {
            return nullptr;
          }
          const auto tracks = te::getAudioTracks(*previewEdit);
          return index < tracks.size() ? tracks[index] : nullptr;
        }()) {
      clearPreviewClipsOnTrack(*track);
    }
  }

  previewSession = {};
  previewEdit = nullptr;
  previewProjectState = nullptr;
  previewEmitEvent = nullptr;
  return makeSuccess("stop_pattern_preview", "{}");
}

}  // namespace musicapp
