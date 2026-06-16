#include "InstrumentParameterCommands.h"

#include "InstrumentCommands.h"
#include "JsonResponse.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <cmath>

namespace musicapp {

namespace te = tracktion::engine;

namespace {

constexpr float kFourOscFilterFreqRange = 135.076232f;
constexpr float kFourOscFilterResonanceRange = 100.0f;

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

bool finiteNumber(const nlohmann::json& object, const char* key, double& value) {
  const auto it = object.find(key);
  if (it == object.end() || !it->is_number()) {
    return false;
  }
  value = it->get<double>();
  return std::isfinite(value);
}

te::AutomatableParameter* instrumentParameter(
    te::FourOscPlugin& fourOsc,
    const std::string& parameterId,
    float& nativeRange) {
  if (parameterId == "filter.cutoff") {
    nativeRange = kFourOscFilterFreqRange;
    return fourOsc.filterFreq.get();
  }
  if (parameterId == "filter.resonance") {
    nativeRange = kFourOscFilterResonanceRange;
    return fourOsc.filterResonance.get();
  }
  return nullptr;
}

}  // namespace

CommandResult handleSetTrackInstrumentParam(
    te::Edit& edit,
    const ProjectState& projectState,
    const std::string& payloadJson) {
  const auto payload = payloadJson.empty()
      ? nlohmann::json::object()
      : nlohmann::json::parse(payloadJson, nullptr, false);
  double requestedValue = 0.0;
  if (payload.is_discarded() || !payload.is_object() || !payload["trackId"].is_string()
      || !payload["parameterId"].is_string() || !finiteNumber(payload, "value", requestedValue)) {
    return makeError(
        "set_track_instrument_param",
        "invalid_payload",
        "Expected trackId, parameterId, and numeric value.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  const auto parameterId = payload["parameterId"].get<std::string>();
  auto* track = trackForId(edit, projectState, trackId);
  if (track == nullptr) {
    return makeError("set_track_instrument_param", "track_not_found", "Track ID is not mapped.");
  }

  auto* fourOsc = findFourOscOnTrack(*track);
  if (fourOsc == nullptr) {
    return makeError(
        "set_track_instrument_param",
        "instrument_unavailable",
        "Track does not have a FourOsc instrument.");
  }

  float nativeRange = 1.0f;
  auto* parameter = instrumentParameter(*fourOsc, parameterId, nativeRange);
  if (parameter == nullptr) {
    return makeError(
        "set_track_instrument_param",
        "parameter_unavailable",
        "Instrument parameter is not available on the native track.");
  }

  const auto normalizedValue = std::clamp(requestedValue, 0.0, 1.0);
  parameter->setParameter(
      static_cast<float>(normalizedValue) * nativeRange,
      juce::sendNotificationSync);

  return makeSuccess(
      "set_track_instrument_param",
      nlohmann::json{
          {"trackId", trackId},
          {"targetType", "instrument"},
          {"parameterId", parameterId},
          {"value", normalizedValue},
      }.dump());
}

}  // namespace musicapp
