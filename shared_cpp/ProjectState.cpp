#include "ProjectState.h"

#include <juce_core/juce_core.h>
#include <algorithm>
#include <cmath>
#include <iterator>
#include <unordered_set>
#include <utility>

namespace musicapp {

namespace {

std::string normalizeSlashes(std::string path) {
  for (auto& ch : path) {
    if (ch == '\\') {
      ch = '/';
    }
  }
  return path;
}

}  // namespace

void ProjectState::setAssetRoot(std::string root) {
  assetRoot_ = std::move(root);
}

void ProjectState::setWritableAssetRoot(std::string root) {
  writableAssetRoot_ = std::move(root);
}

std::string ProjectState::resolveAssetPath(const std::string& relativePath) const {
  const auto normalizedRelativePath = normalizeSlashes(relativePath);
  const bool useWritableRoot = !writableAssetRoot_.empty()
                               && (normalizedRelativePath.rfind("recordings/", 0) == 0
                                   || normalizedRelativePath.rfind("spectrograms/", 0) == 0
                                   || normalizedRelativePath.rfind("imports/", 0) == 0
                                   || normalizedRelativePath.rfind("sample-library/", 0) == 0);
  const auto& rootPath = useWritableRoot ? writableAssetRoot_ : assetRoot_;

  if (rootPath.empty()) {
    return relativePath;
  }

  juce::File root(rootPath);
  juce::String rel(normalizedRelativePath);
  return root.getChildFile(rel).getFullPathName().toStdString();
}

void ProjectState::updateUiTracks(const std::vector<UiTrackRecord>& tracks) {
  uiTracks_ = tracks;
  trackIndexById_.clear();
  trackIndexById_.reserve(uiTracks_.size());

  std::unordered_set<std::string> liveTrackIds;
  for (std::size_t index = 0; index < uiTracks_.size(); ++index) {
    const auto& track = uiTracks_[index];
    trackIndexById_.emplace(track.id, static_cast<int>(index));
    liveTrackIds.insert(track.id);
  }

  for (auto it = fxByTrack_.begin(); it != fxByTrack_.end();) {
    if (liveTrackIds.find(it->first) == liveTrackIds.end()) {
      it = fxByTrack_.erase(it);
    } else {
      ++it;
    }
  }

  for (auto it = ampSimByTrack_.begin(); it != ampSimByTrack_.end();) {
    if (liveTrackIds.find(it->first) == liveTrackIds.end()) {
      it = ampSimByTrack_.erase(it);
    } else {
      ++it;
    }
  }
}

int ProjectState::trackIndexForId(const std::string& trackId) const {
  const auto it = trackIndexById_.find(trackId);
  return it != trackIndexById_.end() ? it->second : -1;
}

bool ProjectState::upsertTrackAutomationPoint(
    const std::string& trackId,
    const std::string& targetType,
    const std::string& parameterId,
    double beat,
    double value,
    UiTrackAutomationLane& updatedLane) {
  if (targetType.empty() || parameterId.empty() || !std::isfinite(beat) || !std::isfinite(value)) {
    return false;
  }

  const int trackIndex = trackIndexForId(trackId);
  if (trackIndex < 0) {
    return false;
  }

  auto& track = uiTracks_[static_cast<std::size_t>(trackIndex)];
  auto laneIt = std::find_if(
      track.automationLanes.begin(),
      track.automationLanes.end(),
      [&](const auto& lane) {
        return lane.targetType == targetType && lane.parameterId == parameterId;
      });
  if (laneIt == track.automationLanes.end()) {
    track.automationLanes.push_back({targetType, parameterId, {}});
    laneIt = std::prev(track.automationLanes.end());
  }

  const double safeBeat = std::max(0.0, beat);
  auto& points = laneIt->points;
  points.erase(
      std::remove_if(
          points.begin(),
          points.end(),
          [&](const auto& point) {
            return std::abs(point.beat - safeBeat) < 0.000001;
          }),
      points.end());
  points.push_back({safeBeat, value});
  std::sort(points.begin(), points.end(), [](const auto& left, const auto& right) {
    return left.beat < right.beat;
  });

  std::sort(
      track.automationLanes.begin(),
      track.automationLanes.end(),
      [](const auto& left, const auto& right) {
        if (left.targetType != right.targetType) {
          return left.targetType < right.targetType;
        }
        return left.parameterId < right.parameterId;
      });
  track.automationLaneCount = static_cast<int>(track.automationLanes.size());

  const auto updatedIt = std::find_if(
      track.automationLanes.begin(),
      track.automationLanes.end(),
      [&](const auto& lane) {
        return lane.targetType == targetType && lane.parameterId == parameterId;
      });
  if (updatedIt == track.automationLanes.end()) {
    return false;
  }
  updatedLane = *updatedIt;
  return true;
}

void ProjectState::setDrumKitSamples(
    const std::string& trackId,
    const std::unordered_map<std::string, std::string>& samples) {
  drumKitByTrack_[trackId] = samples;
}

std::string ProjectState::drumSamplePath(const std::string& trackId, const std::string& sampleKey) const {
  const auto trackIt = drumKitByTrack_.find(trackId);
  if (trackIt == drumKitByTrack_.end()) {
    return {};
  }

  const auto sampleIt = trackIt->second.find(sampleKey);
  if (sampleIt == trackIt->second.end()) {
    return {};
  }

  return resolveAssetPath(sampleIt->second);
}

void ProjectState::setTrackInstrument(const std::string& trackId, const std::string& instrument) {
  instrumentByTrack_[trackId] = instrument;
}

std::string ProjectState::trackInstrument(const std::string& trackId) const {
  const auto it = instrumentByTrack_.find(trackId);
  return it != instrumentByTrack_.end() ? it->second : std::string{};
}

void ProjectState::setTrackPreset(const std::string& trackId, const std::string& presetId) {
  presetByTrack_[trackId] = presetId;
}

std::string ProjectState::trackPreset(const std::string& trackId) const {
  const auto it = presetByTrack_.find(trackId);
  return it != presetByTrack_.end() ? it->second : std::string{};
}

void ProjectState::setTrackRecordArmed(const std::string& trackId, bool armed) {
  recordArmedByTrack_[trackId] = armed;
}

bool ProjectState::isTrackRecordArmed(const std::string& trackId) const {
  const auto it = recordArmedByTrack_.find(trackId);
  return it != recordArmedByTrack_.end() && it->second;
}

void ProjectState::setTrackFxState(const std::string& trackId, TrackFxState state) {
  fxByTrack_[trackId] = std::move(state);
}

bool ProjectState::hasTrackFxState(const std::string& trackId) const {
  return fxByTrack_.find(trackId) != fxByTrack_.end();
}

TrackFxState ProjectState::trackFxState(const std::string& trackId) const {
  const auto it = fxByTrack_.find(trackId);
  return it != fxByTrack_.end() ? it->second : defaultTrackFxState();
}

AmpSimState defaultAmpSimState() {
  AmpSimState state;
  state.pedals = {
      {"gate", "noise_gate", true, {{"threshold", 0.18}, {"floor", 0.06}}},
      {"drive", "overdrive", true, {{"drive", 0.35}, {"tone", 0.55}, {"level", 0.72}, {"mix", 1.0}}},
      {"shape", "eq", true, {{"low", 0.48}, {"mid", 0.58}, {"high", 0.54}, {"level", 0.7}}},
  };
  return state;
}

void ProjectState::setAmpSimState(const std::string& trackId, AmpSimState state) {
  ampSimByTrack_[trackId] = std::move(state);
}

bool ProjectState::hasAmpSimState(const std::string& trackId) const {
  return ampSimByTrack_.find(trackId) != ampSimByTrack_.end();
}

AmpSimState ProjectState::ampSimState(const std::string& trackId) const {
  const auto it = ampSimByTrack_.find(trackId);
  return it != ampSimByTrack_.end() ? it->second : defaultAmpSimState();
}

}  // namespace musicapp
