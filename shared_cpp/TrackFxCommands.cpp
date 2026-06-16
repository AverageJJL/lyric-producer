#include "TrackFxCommands.h"

#include "JsonResponse.h"
#include "TrackFxJson.h"
#include "TrackFxHostCapabilities.h"
#include "TrackSidechainRouting.h"
#include "TrackFxStateApply.h"
#include "fx/AirwindowsFxCatalog.h"

#include <nlohmann/json.hpp>

namespace musicapp {

namespace te = tracktion::engine;

namespace {
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

}  // namespace

CommandResult handleListFxPlugins(const std::string& payloadJson) {
  const auto payload = payloadJson.empty()
      ? nlohmann::json::object()
      : nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.is_object()) {
    return makeError("list_fx_plugins", "invalid_payload", "Expected object payload.");
  }

  nlohmann::json plugins = nlohmann::json::array();
  for (const auto& [slotId, spec] : allAirwindowsPluginSpecs()) {
    nlohmann::json params = nlohmann::json::array();
    for (const auto& param : spec.params) {
      params.push_back({
          {"id", param.id},
          {"label", param.label},
          {"defaultValue", param.defaultValue},
      });
    }
    plugins.push_back({
        {"slot", slotId},
        {"pluginId", spec.pluginId},
        {"displayName", spec.displayName},
        {"format", "builtin_airwindows"},
        {"status", "available"},
        {"params", params},
    });
  }

  return makeSuccess(
      "list_fx_plugins",
      nlohmann::json{
          {"catalogVersion", 1},
          {"pluginCatalogVersion", 1},
          {"externalPluginHosting", externalPluginHostingStatus()},
          {"formats", externalPluginHostFormatsJson()},
          {"plugins", plugins},
      }.dump());
}

CommandResult handleSetTrackFx(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId") || !payload["trackId"].is_string()) {
    return makeError("set_track_fx", "invalid_payload", "Expected payload with trackId.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  auto* track = trackForId(edit, projectState, trackId);
  if (track == nullptr) {
    return makeError("set_track_fx", "track_not_found", "Track ID is not mapped.");
  }

  auto state = projectState.trackFxState(trackId);
  if (auto error = parseTrackFxPayload(payload, state)) {
    return *error;
  }

  const auto applyResult = applyFxState(edit, *track, state);
  if (!applyResult.ok) {
    return applyResult;
  }

  projectState.setTrackFxState(trackId, state);
  applyNativeTrackSidechainRouting(edit, projectState);
  return makeSuccess("set_track_fx", trackFxResponseJson(trackId, state, *track).dump());
}

CommandResult handleGetTrackFx(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId") || !payload["trackId"].is_string()) {
    return makeError("get_track_fx", "invalid_payload", "Expected payload with trackId.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  auto* track = trackForId(edit, projectState, trackId);
  if (track == nullptr) {
    return makeError("get_track_fx", "track_not_found", "Track ID is not mapped.");
  }

  const auto state = projectState.trackFxState(trackId);
  return makeSuccess("get_track_fx", trackFxResponseJson(trackId, state, *track).dump());
}

}  // namespace musicapp
