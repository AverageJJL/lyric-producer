#include "ArrangementCommandHelpers.h"

#include <algorithm>
#include <unordered_map>

namespace te = tracktion::engine;

namespace musicapp {
namespace {

struct ClipGroupEntry {
  std::string key;
  te::Clip* clip = nullptr;
};

std::unordered_map<std::string, std::vector<ClipGroupEntry>> clipGroups;

}  // namespace

tracktion::TimeRange beatRangeToTimeRange(te::Edit& edit, double startBeat, double lengthBeats) {
  const auto start = te::toTime(tracktion::BeatPosition::fromBeats(startBeat), edit.tempoSequence);
  const auto end = te::toTime(
      tracktion::BeatPosition::fromBeats(startBeat + lengthBeats),
      edit.tempoSequence);
  return {start, end};
}

te::ClipPosition beatRangeToClipPosition(
    te::Edit& edit,
    double startBeat,
    double lengthBeats,
    double sourceOffsetBeats) {
  const auto start = tracktion::BeatPosition::fromBeats(startBeat);
  const auto end = tracktion::BeatPosition::fromBeats(startBeat + lengthBeats);
  const auto sourceOffset =
      tracktion::BeatDuration::fromBeats(std::max(0.0, sourceOffsetBeats));
  return te::createClipPosition(edit.tempoSequence, {start, end}, sourceOffset);
}

te::AudioTrack* trackForId(
    te::Edit& edit,
    const ProjectState& projectState,
    const std::string& trackId) {
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

bool hasClipGroup(const std::string& clipId) {
  return clipGroups.find(clipId) != clipGroups.end();
}

void rememberClipGroup(const std::string& clipId, std::vector<te::Clip*> clips) {
  std::vector<ClipGroupEntry> entries;
  entries.reserve(clips.size());
  for (auto* clip : clips) {
    entries.push_back({"", clip});
  }
  clipGroups[clipId] = std::move(entries);
}

void rememberClipGroupEntries(
    const std::string& clipId,
    std::vector<std::pair<std::string, te::Clip*>> clips) {
  std::vector<ClipGroupEntry> entries;
  entries.reserve(clips.size());
  for (auto& clip : clips) {
    entries.push_back({std::move(clip.first), clip.second});
  }
  clipGroups[clipId] = std::move(entries);
}

void appendClipGroupEntries(
    const std::string& clipId,
    std::vector<std::pair<std::string, te::Clip*>> clips) {
  auto& entries = clipGroups[clipId];
  entries.reserve(entries.size() + clips.size());
  for (auto& clip : clips) {
    entries.push_back({std::move(clip.first), clip.second});
  }
}

void removeClipGroupEntries(const std::string& clipId, const std::vector<std::string>& keys) {
  const auto it = clipGroups.find(clipId);
  if (it == clipGroups.end()) {
    return;
  }

  auto& entries = it->second;
  for (auto entryIt = entries.begin(); entryIt != entries.end();) {
    if (std::find(keys.begin(), keys.end(), entryIt->key) == keys.end()) {
      ++entryIt;
      continue;
    }

    if (entryIt->clip != nullptr) {
      entryIt->clip->removeFromParent();
    }
    entryIt = entries.erase(entryIt);
  }
}

void removeClipGroup(ProjectState& projectState, const std::string& clipId) {
  juce::ignoreUnused(projectState);
  const auto it = clipGroups.find(clipId);
  if (it == clipGroups.end()) {
    return;
  }

  for (auto& entry : it->second) {
    if (entry.clip != nullptr) {
      entry.clip->removeFromParent();
    }
  }

  clipGroups.erase(it);
}

}  // namespace musicapp
