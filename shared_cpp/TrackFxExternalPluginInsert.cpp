#include "TrackFxExternalPluginInsert.h"

#include "JsonResponse.h"
#include "TrackFxExternalPluginDescription.h"
#include "TrackFxHostCapabilities.h"

#include <nlohmann/json.hpp>

#include <optional>
#include <string>
#include <utility>

namespace musicapp {

namespace te = tracktion::engine;

namespace {

const juce::Identifier kManagedExternalFxSlot{"musicAppManagedExternalFxSlot"};
const juce::Identifier kManagedExternalFxFormat{"musicAppManagedExternalFxFormat"};

struct InsertCandidate {
  std::string pluginId;
  std::string displayName;
  std::string format;
  std::string path;
};

struct InsertValidationRequest {
  std::string trackId;
  std::string slot;
  InsertCandidate candidate;
};

bool isKnownSlot(const std::string& slot) {
  return slot == "eq" || slot == "compressor" || slot == "reverb";
}

std::string stringFieldOr(const nlohmann::json& object, const char* key, std::string fallback = {}) {
  const auto it = object.find(key);
  return it != object.end() && it->is_string() ? it->get<std::string>() : std::move(fallback);
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

std::optional<InsertValidationRequest> parseRequest(
    const nlohmann::json& payload,
    std::string& errorMessage) {
  InsertValidationRequest request;
  request.trackId = stringFieldOr(payload, "trackId");
  request.slot = stringFieldOr(payload, "slot");

  if (request.trackId.empty()) {
    errorMessage = "trackId must be a non-empty string.";
    return std::nullopt;
  }
  if (!isKnownSlot(request.slot)) {
    errorMessage = "slot must be eq, compressor, or reverb.";
    return std::nullopt;
  }

  const auto candidateIt = payload.find("candidate");
  if (candidateIt == payload.end() || !candidateIt->is_object()) {
    errorMessage = "candidate must be an object.";
    return std::nullopt;
  }

  request.candidate.path = stringFieldOr(*candidateIt, "path");
  request.candidate.format = stringFieldOr(*candidateIt, "format");
  request.candidate.displayName = stringFieldOr(*candidateIt, "displayName");
  request.candidate.pluginId = stringFieldOr(*candidateIt, "pluginId");

  if (request.candidate.path.empty()) {
    errorMessage = "candidate.path must be a non-empty string.";
    return std::nullopt;
  }
  if (!isExternalPluginFormat(request.candidate.format)) {
    errorMessage = "candidate.format must be external_au or external_vst3.";
    return std::nullopt;
  }
  if (request.candidate.displayName.empty()) {
    request.candidate.displayName = request.candidate.path;
  }
  if (request.candidate.pluginId.empty()) {
    request.candidate.pluginId = request.candidate.format + ":" + request.candidate.path;
  }

  return request;
}

nlohmann::json candidateJson(const InsertCandidate& candidate) {
  return {
      {"pluginId", candidate.pluginId},
      {"displayName", candidate.displayName},
      {"format", candidate.format},
      {"path", candidate.path},
  };
}

nlohmann::json validationJson(const InsertValidationRequest& request) {
  const bool formatEnabled = externalPluginFormatEnabled(request.candidate.format);
  const auto description = formatEnabled
      ? findExternalPluginDescriptionForFile(request.candidate.path, request.candidate.format)
      : nullptr;
  const bool canInsert = description != nullptr;
  const auto reason = !formatEnabled ? std::string{"external_plugin_hosting_disabled"}
      : canInsert ? std::string{"ready"}
                  : std::string{"plugin_description_not_found"};

  auto json = nlohmann::json{
      {"insertValidationVersion", 1},
      {"trackId", request.trackId},
      {"slot", request.slot},
      {"candidate", candidateJson(request.candidate)},
      {"externalPluginHosting", externalPluginHostingStatus()},
      {"canInsert", canInsert},
      {"requiresProbe", formatEnabled},
      {"status", canInsert ? "available" : "disabled"},
      {"reason", reason},
      {"recoveryHint", externalPluginRecoveryHint(request.candidate.format)},
  };
  if (description != nullptr) {
    json["description"] = externalPluginDescriptionJson(*description);
  }
  return json;
}

}  // namespace

CommandResult handleValidateFxPluginInsert(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  const auto payload = payloadJson.empty()
      ? nlohmann::json::object()
      : nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.is_object()) {
    return makeError("validate_fx_plugin_insert", "invalid_payload", "Expected object payload.");
  }

  std::string errorMessage;
  const auto request = parseRequest(payload, errorMessage);
  if (!request) {
    return makeError("validate_fx_plugin_insert", "invalid_payload", errorMessage);
  }
  if (trackForId(edit, projectState, request->trackId) == nullptr) {
    return makeError("validate_fx_plugin_insert", "track_not_found", "Track ID is not mapped.");
  }

  return makeSuccess("validate_fx_plugin_insert", validationJson(*request).dump());
}

bool isManagedExternalFxPlugin(te::Plugin* plugin) {
  return plugin != nullptr &&
      plugin->getPluginType() == te::ExternalPlugin::xmlTypeName &&
      plugin->state.hasProperty(kManagedExternalFxSlot);
}

std::string managedExternalFxSlotId(te::Plugin* plugin) {
  if (!isManagedExternalFxPlugin(plugin)) {
    return {};
  }
  return plugin->state[kManagedExternalFxSlot].toString().toStdString();
}

CommandResult insertExternalFxPlugin(
    te::Edit& edit,
    te::AudioTrack& track,
    const PluginChainSlotState& chainSlot,
    int insertIndex,
    bool active) {
  const auto path = externalPluginPathFromPluginId(chainSlot.pluginId, chainSlot.format);
  auto description = findExternalPluginDescriptionForFile(path, chainSlot.format);
  if (description == nullptr) {
    return makeError(
        "set_track_fx",
        "plugin_description_not_found",
        "No plugin descriptions found for the external FX slot.");
  }

  auto plugin = edit.getPluginCache().createNewPlugin(te::ExternalPlugin::xmlTypeName, *description);
  auto* externalPlugin = dynamic_cast<te::ExternalPlugin*>(plugin.get());
  if (externalPlugin == nullptr) {
    return makeError("set_track_fx", "plugin_create_failed", "Could not create external FX plugin.");
  }

  externalPlugin->state.setProperty(kManagedExternalFxSlot, juce::String(chainSlot.slot), nullptr);
  externalPlugin->state.setProperty(kManagedExternalFxFormat, juce::String(chainSlot.format), nullptr);
  externalPlugin->setEnabled(active);
  track.pluginList.insertPlugin(plugin, insertIndex, nullptr);
  return makeSuccess("set_track_fx");
}

}  // namespace musicapp
