#include "TrackAutomation.h"

#include <algorithm>
#include <cmath>

namespace musicapp {

namespace {

double finiteBeatOrZero(double beat) {
  return std::isfinite(beat) ? std::max(0.0, beat) : 0.0;
}

bool isReadableTrackMixLane(const UiTrackAutomationLane& lane) {
  return lane.targetType == "track"
      && (lane.parameterId == "volumeDb" || lane.parameterId == "pan")
      && !lane.points.empty();
}

}  // namespace

bool trackAutomationReadEnabled(const UiTrackRecord& track) {
  return track.automationMode == "read"
      || track.automationMode == "touch"
      || track.automationMode == "latch";
}

bool trackAutomationWriteCaptureEnabled(const UiTrackRecord& track) {
  return track.automationMode == "write"
      || track.automationMode == "touch"
      || track.automationMode == "latch";
}

const UiTrackAutomationLane* findTrackAutomationLane(
    const UiTrackRecord& track,
    const std::string& targetType,
    const std::string& parameterId) {
  for (const auto& lane : track.automationLanes) {
    if (lane.targetType == targetType && lane.parameterId == parameterId) {
      return &lane;
    }
  }
  return nullptr;
}

double evaluateAutomationLaneValue(
    const UiTrackAutomationLane& lane,
    double beat,
    double fallback) {
  if (lane.points.empty()) {
    return fallback;
  }

  const double safeBeat = finiteBeatOrZero(beat);
  if (safeBeat <= lane.points.front().beat) {
    return lane.points.front().value;
  }
  if (safeBeat >= lane.points.back().beat) {
    return lane.points.back().value;
  }

  for (std::size_t index = 1; index < lane.points.size(); ++index) {
    const auto& previous = lane.points[index - 1];
    const auto& current = lane.points[index];
    if (safeBeat > current.beat) {
      continue;
    }

    const double span = current.beat - previous.beat;
    if (span <= 0.0) {
      return current.value;
    }

    const double ratio = std::clamp((safeBeat - previous.beat) / span, 0.0, 1.0);
    return previous.value + (current.value - previous.value) * ratio;
  }

  return lane.points.back().value;
}

std::optional<double> evaluateReadableTrackAutomation(
    const UiTrackRecord& track,
    const std::string& parameterId,
    double beat) {
  if (!trackAutomationReadEnabled(track)) {
    return std::nullopt;
  }

  const auto* lane = findTrackAutomationLane(track, "track", parameterId);
  if (lane != nullptr && !lane->points.empty()) {
    return evaluateAutomationLaneValue(*lane, beat, 0.0);
  }
  return std::nullopt;
}

bool hasReadableTrackAutomation(const UiTrackRecord& track) {
  if (!trackAutomationReadEnabled(track)) {
    return false;
  }

  return std::any_of(
      track.automationLanes.begin(),
      track.automationLanes.end(),
      isReadableTrackMixLane);
}

double automationAppliedTrackVolumeDb(const UiTrackRecord& track, double beat) {
  const auto value = evaluateReadableTrackAutomation(track, "volumeDb", beat);
  return std::clamp(value.value_or(track.volumeDb), -60.0, 6.0);
}

double automationAppliedTrackPan(const UiTrackRecord& track, double beat) {
  const auto value = evaluateReadableTrackAutomation(track, "pan", beat);
  return std::clamp(value.value_or(track.pan), -1.0, 1.0);
}

}  // namespace musicapp
