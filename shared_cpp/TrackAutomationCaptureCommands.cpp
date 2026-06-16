#include "TrackAutomationCaptureCommands.h"

#include "InstrumentCommands.h"
#include "JsonResponse.h"
#include "MusicAppAirwindowsFxPlugin.h"
#include "TrackAutomation.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <cmath>
#include <optional>

namespace musicapp {

namespace te = tracktion::engine;

namespace {

constexpr float kFourOscFilterFreqRange = 135.076232f;
constexpr float kFourOscFilterResonanceRange = 100.0f;

double finiteNumberOr(const nlohmann::json& object, const char* key, double fallback) {
  const auto it = object.find(key);
  if (it == object.end() || !it->is_number()) {
    return fallback;
  }
  const double value = it->get<double>();
  return std::isfinite(value) ? value : fallback;
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
  return index < tracks.size() ? tracks[index] : nullptr;
}

const UiTrackRecord* trackRecordForId(
    const ProjectState& projectState,
    const std::string& trackId) {
  for (const auto& track : projectState.uiTracks()) {
    if (track.id == trackId) {
      return &track;
    }
  }
  return nullptr;
}

bool splitFxParameterId(
    const std::string& parameterId,
    std::string& slotId,
    std::string& nativeParamId) {
  const auto separator = parameterId.find('.');
  if (separator == std::string::npos || separator == 0 || separator + 1 >= parameterId.size()) {
    return false;
  }

  slotId = parameterId.substr(0, separator);
  nativeParamId = parameterId.substr(separator + 1);
  return slotId == "eq" || slotId == "compressor" || slotId == "reverb";
}

std::optional<double> captureTrackValue(te::AudioTrack& track, const std::string& parameterId) {
  auto* volume = track.getVolumePlugin();
  if (volume == nullptr) {
    return std::nullopt;
  }
  if (parameterId == "volumeDb") {
    return volume->getVolumeDb();
  }
  if (parameterId == "pan") {
    return volume->getPan();
  }
  return std::nullopt;
}

std::optional<double> captureFxValue(te::AudioTrack& track, const std::string& parameterId) {
  std::string slotId;
  std::string nativeParamId;
  if (!splitFxParameterId(parameterId, slotId, nativeParamId)) {
    return std::nullopt;
  }

  for (auto* plugin : track.pluginList) {
    auto* fx = dynamic_cast<MusicAppAirwindowsFxPlugin*>(plugin);
    if (fx == nullptr || fx->slotId() != slotId) {
      continue;
    }
    const auto parameter = fx->getAutomatableParameterByID(nativeParamId);
    if (parameter != nullptr) {
      return std::clamp(static_cast<double>(parameter->getCurrentValue()), 0.0, 1.0);
    }
  }
  return std::nullopt;
}

std::optional<double> captureInstrumentValue(
    te::AudioTrack& track,
    const std::string& parameterId) {
  auto* fourOsc = findFourOscOnTrack(track);
  if (fourOsc == nullptr) {
    return std::nullopt;
  }
  if (parameterId == "filter.cutoff") {
    return std::clamp(
        static_cast<double>(fourOsc->filterFreq->getCurrentValue() / kFourOscFilterFreqRange),
        0.0,
        1.0);
  }
  if (parameterId == "filter.resonance") {
    return std::clamp(
        static_cast<double>(fourOsc->filterResonance->getCurrentValue()
                            / kFourOscFilterResonanceRange),
        0.0,
        1.0);
  }
  return std::nullopt;
}

std::optional<double> captureValue(
    te::AudioTrack& track,
    const std::string& targetType,
    const std::string& parameterId) {
  if (targetType == "track") {
    return captureTrackValue(track, parameterId);
  }
  if (targetType == "fx") {
    return captureFxValue(track, parameterId);
  }
  if (targetType == "instrument") {
    return captureInstrumentValue(track, parameterId);
  }
  return std::nullopt;
}

nlohmann::json laneJson(const UiTrackAutomationLane& lane) {
  nlohmann::json points = nlohmann::json::array();
  for (const auto& point : lane.points) {
    points.push_back({{"beat", point.beat}, {"value", point.value}});
  }
  return {
      {"targetType", lane.targetType},
      {"parameterId", lane.parameterId},
      {"pointCount", static_cast<int>(lane.points.size())},
      {"points", points},
  };
}

}  // namespace

CommandResult handleCaptureTrackAutomation(
    te::Edit& edit,
    ProjectState& projectState,
    double defaultBeat,
    const std::string& payloadJson) {
  const auto payload = payloadJson.empty()
      ? nlohmann::json::object()
      : nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.is_object() || !payload["trackId"].is_string()
      || !payload["targetType"].is_string() || !payload["parameterId"].is_string()) {
    return makeError(
        "capture_track_automation",
        "invalid_payload",
        "Expected trackId, targetType, and parameterId strings.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  const auto targetType = payload["targetType"].get<std::string>();
  const auto parameterId = payload["parameterId"].get<std::string>();
  const auto* trackRecord = trackRecordForId(projectState, trackId);
  auto* track = trackForId(edit, projectState, trackId);
  if (trackRecord == nullptr || track == nullptr) {
    return makeError("capture_track_automation", "track_not_found", "Track ID is not mapped.");
  }
  if (!trackAutomationWriteCaptureEnabled(*trackRecord)) {
    return makeError(
        "capture_track_automation",
        "automation_write_disabled",
        "Track automation mode must be write, touch, or latch.");
  }

  const auto captured = captureValue(*track, targetType, parameterId);
  if (!captured.has_value()) {
    return makeError(
        "capture_track_automation",
        "parameter_unavailable",
        "Automation target is not available on the native track.");
  }

  UiTrackAutomationLane updatedLane;
  const double beat = std::max(0.0, finiteNumberOr(payload, "beat", defaultBeat));
  if (!projectState.upsertTrackAutomationPoint(
          trackId,
          targetType,
          parameterId,
          beat,
          *captured,
          updatedLane)) {
    return makeError(
        "capture_track_automation",
        "capture_failed",
        "Could not store the captured automation point.");
  }

  return makeSuccess(
      "capture_track_automation",
      nlohmann::json{
          {"trackId", trackId},
          {"targetType", targetType},
          {"parameterId", parameterId},
          {"beat", beat},
          {"value", *captured},
          {"automationMode", trackRecord->automationMode},
          {"lane", laneJson(updatedLane)},
      }.dump());
}

}  // namespace musicapp
