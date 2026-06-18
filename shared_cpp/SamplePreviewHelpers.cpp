#include "SampleOneShotPlayer.h"

#include "DrumSampleDuration.h"

#include <algorithm>
#include <tracktion_engine/tracktion_engine.h>

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

}  // namespace

void clearPreviewClipsOnTrack(te::AudioTrack& track) {
  juce::Array<te::Clip*> toRemove;
  for (auto* clip : track.getClips()) {
    // The plain Copilot label shipped briefly before phrase preview joined the shared
    // preview namespace. Keep removing it so stale preview clips cannot layer playback.
    if (
        clip != nullptr &&
        (clip->getName().startsWith("__preview__") ||
         clip->getName() == "Copilot Preview")) {
      toRemove.add(clip);
    }
  }

  for (auto* clip : toRemove) {
    clip->removeFromParent();
  }
}

void restoreLinearTransport(te::Edit& edit, const double restoreBeat) {
  auto& transport = edit.getTransport();
  transport.stop(false, false);
  transport.looping = false;

  const auto rangeStart = te::toTime(
      tracktion::BeatPosition::fromBeats(0.0),
      edit.tempoSequence);
  const auto rangeEnd = te::toTime(
      tracktion::BeatPosition::fromBeats(4096.0),
      edit.tempoSequence);
  transport.setLoopRange({rangeStart, rangeEnd - rangeStart});
  transport.setPosition(te::toTime(
      tracktion::BeatPosition::fromBeats(restoreBeat),
      edit.tempoSequence));
}

void clearAllPreviewClips(te::Edit& edit, const ProjectState& projectState) {
  for (const auto& uiTrack : projectState.uiTracks()) {
    auto* track = resolveTrack(edit, projectState, uiTrack.id);
    if (track != nullptr) {
      clearPreviewClipsOnTrack(*track);
    }
  }
}

bool insertDrumPreviewClip(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& trackId,
    const std::string& sampleKey,
    const int stepIndex,
    const double beat) {
  if (!isTrackAudibleForLiveInput(projectState, trackId)) {
    return false;
  }

  auto* track = resolveTrack(edit, projectState, trackId);
  if (track == nullptr) {
    return false;
  }

  const auto samplePath = projectState.drumSamplePath(trackId, sampleKey);
  if (samplePath.empty()) {
    return false;
  }

  const juce::File file(samplePath);
  if (!file.existsAsFile()) {
    return false;
  }

  const double loopEndBeat = kDrumPreviewRegionStartBeat + kPreviewPatternBeats;
  const double roomBeats = loopEndBeat - beat;
  if (roomBeats <= 1e-6) {
    return false;
  }

  const double clipDurationBeats = std::min(
      drumClipDurationBeats(file, edit.tempoSequence),
      roomBeats);
  const auto clipStart = te::toTime(
      tracktion::BeatPosition::fromBeats(beat),
      edit.tempoSequence);
  const auto clipEnd = te::toTime(
      tracktion::BeatPosition::fromBeats(beat + clipDurationBeats),
      edit.tempoSequence);
  const tracktion::TimeDuration clipDuration = clipEnd - clipStart;
  const juce::String clipLabel = juce::String("__preview__") + juce::String(trackId) + "-"
                                 + juce::String(sampleKey) + "-s"
                                 + juce::String(stepIndex);

  return track->insertWaveClip(clipLabel, file, {{clipStart, clipDuration}, {}}, false)
      != nullptr;
}

}  // namespace musicapp
