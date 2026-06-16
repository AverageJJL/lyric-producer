#include "SampleOneShotPlayer.h"

#include "DrumPatternPreview.h"
#include "DrumSampleDuration.h"
#include "JsonResponse.h"
#include "ProjectState.h"
#include "TempoSequenceTime.h"

#include <chrono>
#include <nlohmann/json.hpp>
#include <tracktion_engine/tracktion_engine.h>
#include <utility>

namespace te = tracktion::engine;

namespace musicapp {

namespace {

te::AudioTrack* resolveTrack(te::Edit& edit, const ProjectState& projectState, const std::string& trackId) {
  const int index = projectState.trackIndexForId(trackId);
  if (index < 0) {
    return nullptr;
  }

  const auto tracks = te::getAudioTracks(edit);
  if (index >= tracks.size()) {
    return nullptr;
  }

  return tracks[index];
}

bool isTrackAudibleForLiveInput(const ProjectState& projectState, const std::string& trackId) {
  const auto& uiTracks = projectState.uiTracks();
  bool anySolo = false;
  for (const auto& track : uiTracks) {
    if (track.isSolo) {
      anySolo = true;
      break;
    }
  }

  for (const auto& track : uiTracks) {
    if (track.id != trackId) {
      continue;
    }
    if (track.isMuted) {
      return false;
    }
    if (anySolo && !track.isSolo) {
      return false;
    }
    return true;
  }

  return true;
}

bool isInSongTimelineRegion(double beat) {
  return beat < kDrumPreviewRegionStartBeat - 1.0;
}

/** Last playhead in the song timeline — never seek to 0 after preview-region audition. */
double& lastSongTimelineBeat() {
  static double beat = 0.0;
  return beat;
}

int& activeAuditionGeneration() {
  static int gen = 0;
  return gen;
}

void scheduleOneShotAuditionEnd(
    te::Edit& edit,
    double clipDurationSeconds,
    double restoreBeat,
    bool restoreClickRecordingOnly,
    EngineDelayedTaskScheduler scheduleOnEngineThread) {
  const int gen = ++activeAuditionGeneration();
  const int delayMs = static_cast<int>(clipDurationSeconds * 1000.0) + 30;

  scheduleOnEngineThread(
      std::chrono::milliseconds(delayMs),
      [editPtr = &edit, restoreBeat, restoreClickRecordingOnly, gen]() {
        const bool skippedStale = gen != activeAuditionGeneration();
        const bool patternPreview = isDrumPatternPreviewActive();

        if (skippedStale || patternPreview) {
          return;
        }

        auto& transport = editPtr->getTransport();
        transport.stop(false, false);
        transport.setPosition(te::toTime(
            tracktion::BeatPosition::fromBeats(restoreBeat),
            editPtr->tempoSequence));
        editPtr->clickTrackRecordingOnly = restoreClickRecordingOnly;
      });
}

}  // namespace

void cancelSampleOneShotAuditions() {
  ++activeAuditionGeneration();
}

CommandResult triggerSampleOneShotAtBeat(
    te::Engine& engine,
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& trackId,
    const std::string& sampleKey,
    double beat,
    const bool oneShotAudition,
    EngineDelayedTaskScheduler scheduleOnEngineThread) {
  juce::ignoreUnused(engine);

  if (!isTrackAudibleForLiveInput(projectState, trackId)) {
    nlohmann::json data;
    data["ignored"] = true;
    return makeSuccess("play_sample", data.dump());
  }

  auto* track = resolveTrack(edit, projectState, trackId);
  if (track == nullptr) {
    return makeError("play_sample", "track_not_found", "Track ID is not mapped.");
  }

  const auto samplePath = projectState.drumSamplePath(trackId, sampleKey);
  if (samplePath.empty()) {
    return makeError("play_sample", "sample_not_found", "Sample is not mapped for this track.");
  }

  const juce::File file(samplePath);
  if (!file.existsAsFile()) {
    return makeError("play_sample", "sample_missing", "Sample file does not exist on disk.");
  }

  auto& transport = edit.getTransport();
  transport.ensureContextAllocated();

  const bool patternPreview = isDrumPatternPreviewActive();
  const bool wasPlaying = transport.isPlaying();
  const double rawBeat = beatAtSeconds(edit.tempoSequence, transport.getPosition().inSeconds());
  if (isInSongTimelineRegion(rawBeat)) {
    lastSongTimelineBeat() = rawBeat;
  }

  const double fileDurationBeats = drumClipDurationBeats(file, edit.tempoSequence);
  const double clipDurationBeats = fileDurationBeats;
  const double restoreBeat = lastSongTimelineBeat();

  const auto clipStart = te::toTime(
      tracktion::BeatPosition::fromBeats(beat),
      edit.tempoSequence);
  const auto clipEnd = te::toTime(
      tracktion::BeatPosition::fromBeats(beat + clipDurationBeats),
      edit.tempoSequence);
  const tracktion::TimeDuration clipDuration = clipEnd - clipStart;
  const juce::String clipLabel =
      juce::String("__preview__") + juce::String(trackId) + "-" + juce::String(sampleKey);

  track->insertWaveClip(clipLabel, file, {{clipStart, clipDuration}, {}}, false);

  if (!patternPreview) {
    transport.setPosition(clipStart);
  }

  if (oneShotAudition) {
    ++activeAuditionGeneration();
    const bool restoreClickRecordingOnly = edit.clickTrackRecordingOnly.get();
    // Mute metronome during pad audition — transport.play is required for the clip,
    // but click should stay recording-only (Tracktion clickTrackRecordingOnly).
    edit.clickTrackRecordingOnly = true;
    transport.stop(false, false);
    transport.setPosition(clipStart);
    transport.play(false);
    scheduleOneShotAuditionEnd(
        edit,
        secondsForBeatDurationAtBeat(edit.tempoSequence, beat, clipDurationBeats),
        restoreBeat,
        restoreClickRecordingOnly,
        std::move(scheduleOnEngineThread));
  } else if (!wasPlaying) {
    transport.play(false);
  }

  nlohmann::json data;
  data["trackId"] = trackId;
  data["sampleKey"] = sampleKey;
  data["previewBeat"] = beat;
  return makeSuccess("play_sample", data.dump());
}

CommandResult triggerSampleOneShot(
    te::Engine& engine,
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& trackId,
    const std::string& sampleKey,
    const int stepIndex,
    EngineDelayedTaskScheduler scheduleOnEngineThread) {
  auto* track = resolveTrack(edit, projectState, trackId);
  if (track != nullptr) {
    clearPreviewClipsOnTrack(*track);
  }

  const double beat =
      kDrumPreviewRegionStartBeat + static_cast<double>(stepIndex) * kPreviewStepSpacingBeats;

  return triggerSampleOneShotAtBeat(
      engine,
      edit,
      projectState,
      trackId,
      sampleKey,
      beat,
      true,
      std::move(scheduleOnEngineThread));
}

}  // namespace musicapp
