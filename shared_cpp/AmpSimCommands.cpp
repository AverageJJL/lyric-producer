#include "AmpSimCommands.h"
#include "JsonResponse.h"
#include "MusicAppAmpSimPlugin.h"
#include "MusicAppGainTrimPlugin.h"
#include "SamplerInstrumentCommands.h"
#include <algorithm>
#include <nlohmann/json.hpp>
#include <unordered_set>
namespace musicapp {

namespace te = tracktion::engine;

namespace {
constexpr int kMaxPedals = 8;
double clamp01(double value) {
  return std::min(1.0, std::max(0.0, value));
}
bool isSupportedPedalType(const std::string& type) {
  return type == "noise_gate" || type == "compressor" || type == "overdrive"
         || type == "eq" || type == "boost";
}
bool isSupportedCabinet(const std::string& irId) {
  return irId == "guitar_us_2x12" || irId == "guitar_uk_4x12"
         || irId == "bass_modern_8x10" || irId == "bass_vintage_1x15";
}
std::string defaultCabinetForMode(const std::string& inputMode) {
  return inputMode == "bass_di" ? "bass_modern_8x10" : "guitar_us_2x12";
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

MusicAppAmpSimPlugin* findAmpSimPlugin(te::AudioTrack& track) {
  for (auto* plugin : track.pluginList) {
    if (auto* amp = dynamic_cast<MusicAppAmpSimPlugin*>(plugin)) {
      return amp;
    }
  }
  return nullptr;
}

void clearAmpSimPlugins(te::AudioTrack& track) {
  const auto plugins = track.pluginList.getPlugins();
  for (auto* plugin : plugins) {
    if (isManagedAmpSimPlugin(plugin)) {
      plugin->deleteFromParent();
    }
  }
}

int ampInsertIndex(te::AudioTrack& track) {
  for (int index = 0; index < track.pluginList.size(); ++index) {
    if (dynamic_cast<te::FourOscPlugin*>(track.pluginList[index]) != nullptr
        || isSamplerInstrumentPlugin(track.pluginList[index])
        || isManagedGainTrimPlugin(track.pluginList[index])) {
      return index + 1;
    }
  }
  return 0;
}

CommandResult parseAmpPayload(
    const nlohmann::json& payload,
    AmpSimState& state) {
  if (payload.contains("enabled") && payload["enabled"].is_boolean()) {
    state.enabled = payload["enabled"].get<bool>();
  }

  const bool inputModeChanged =
      payload.contains("inputMode") && payload["inputMode"].is_string()
      && payload["inputMode"].get<std::string>() != state.inputMode;
  if (payload.contains("inputMode") && payload["inputMode"].is_string()) {
    const auto mode = payload["inputMode"].get<std::string>();
    state.inputMode = mode == "bass_di" ? "bass_di" : "guitar_di";
  }

  if (inputModeChanged && !payload.contains("cabinet")) {
    state.cabinet.irId = defaultCabinetForMode(state.inputMode);
  }

  if (payload.contains("pedals")) {
    if (!payload["pedals"].is_array()) {
      return makeError("set_amp_sim", "invalid_payload", "Amp sim pedals must be an array.");
    }
    state.pedals.clear();
    std::unordered_set<std::string> seenIds;
    for (const auto& pedalJson : payload["pedals"]) {
      if (!pedalJson.is_object() || !pedalJson.contains("type")
          || !pedalJson["type"].is_string()) {
        return makeError("set_amp_sim", "invalid_payload", "Amp sim pedals require a type.");
      }
      AmpSimPedalState pedal;
      pedal.type = pedalJson["type"].get<std::string>();
      if (!isSupportedPedalType(pedal.type)) {
        return makeError("set_amp_sim", "invalid_payload", "Unknown amp sim pedal type.");
      }
      pedal.id = pedalJson.value("id", "pedal-" + std::to_string(state.pedals.size() + 1));
      if (!seenIds.insert(pedal.id).second) {
        return makeError("set_amp_sim", "invalid_payload", "Duplicate amp sim pedal id.");
      }
      pedal.enabled = pedalJson.value("enabled", true);
      if (pedalJson.contains("params") && pedalJson["params"].is_object()) {
        for (auto it = pedalJson["params"].begin(); it != pedalJson["params"].end(); ++it) {
          if (it.value().is_number()) {
            pedal.params[it.key()] = clamp01(it.value().get<double>());
          }
        }
      }
      if (state.pedals.size() < kMaxPedals) {
        state.pedals.push_back(std::move(pedal));
      }
    }
  }

  if (payload.contains("cabinet")) {
    const auto& cabinet = payload["cabinet"];
    if (!cabinet.is_object()) {
      return makeError("set_amp_sim", "invalid_payload", "Amp sim cabinet must be an object.");
    }
    state.cabinet.enabled = cabinet.value("enabled", state.cabinet.enabled);
    if (cabinet.contains("irId") && cabinet["irId"].is_string()
        && isSupportedCabinet(cabinet["irId"].get<std::string>())) {
      state.cabinet.irId = cabinet["irId"].get<std::string>();
    }
    if (cabinet.contains("mix") && cabinet["mix"].is_number()) {
      state.cabinet.mix = clamp01(cabinet["mix"].get<double>());
    }
  }

  return makeSuccess("set_amp_sim");
}

nlohmann::json ampStateToJson(
    const std::string& trackId,
    const AmpSimState& state,
    const UiTrackRecord* track) {
  nlohmann::json pedals = nlohmann::json::array();
  for (const auto& pedal : state.pedals) {
    nlohmann::json params = nlohmann::json::object();
    for (const auto& entry : pedal.params) {
      params[entry.first] = entry.second;
    }
    pedals.push_back({
        {"id", pedal.id},
        {"type", pedal.type},
        {"enabled", pedal.enabled},
        {"params", params},
    });
  }

  const bool monitoring = track != nullptr && track->isInputMonitoringEnabled;
  return {
      {"trackId", trackId},
      {"enabled", state.enabled},
      {"inputMode", state.inputMode},
      {"monitoring", monitoring},
      {"lowLatencyMonitoring", monitoring && track != nullptr && track->type == "voice_audio"},
      {"pedals", pedals},
      {"cabinet", {
          {"enabled", state.cabinet.enabled},
          {"irId", state.cabinet.irId},
          {"mix", state.cabinet.mix},
      }},
  };
}

CommandResult applyAmpState(
    te::Edit& edit,
    te::AudioTrack& track,
    const AmpSimState& state) {
  if (!state.enabled) {
    clearAmpSimPlugins(track);
    return makeSuccess("set_amp_sim");
  }

  auto* amp = findAmpSimPlugin(track);
  if (amp == nullptr) {
    auto plugin = edit.getPluginCache().createNewPlugin(MusicAppAmpSimPlugin::create());
    amp = dynamic_cast<MusicAppAmpSimPlugin*>(plugin.get());
    if (amp == nullptr) {
      return makeError("set_amp_sim", "plugin_create_failed", "Could not create amp sim plugin.");
    }
    track.pluginList.insertPlugin(plugin, ampInsertIndex(track), nullptr);
  }

  amp->setAmpSimState(state);
  return makeSuccess("set_amp_sim");
}

}  // namespace

CommandResult handleSetAmpSim(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId") || !payload["trackId"].is_string()) {
    return makeError("set_amp_sim", "invalid_payload", "Expected payload with trackId.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  const auto* record = trackRecordForId(projectState, trackId);
  auto* track = trackForId(edit, projectState, trackId);
  if (record == nullptr || track == nullptr) {
    return makeError("set_amp_sim", "track_not_found", "Track ID is not mapped.");
  }
  if (record->type != "voice_audio") {
    return makeError("set_amp_sim", "unsupported_track", "Amp sim requires an audio/DI track.");
  }

  auto state = projectState.ampSimState(trackId);
  const auto parseResult = parseAmpPayload(payload, state);
  if (!parseResult.ok) {
    return parseResult;
  }

  const auto applyResult = applyAmpState(edit, *track, state);
  if (!applyResult.ok) {
    return applyResult;
  }

  projectState.setAmpSimState(trackId, state);
  return makeSuccess("set_amp_sim", ampStateToJson(trackId, state, record).dump());
}

CommandResult handleGetAmpSim(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId") || !payload["trackId"].is_string()) {
    return makeError("get_amp_sim", "invalid_payload", "Expected payload with trackId.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  const auto* record = trackRecordForId(projectState, trackId);
  if (record == nullptr || trackForId(edit, projectState, trackId) == nullptr) {
    return makeError("get_amp_sim", "track_not_found", "Track ID is not mapped.");
  }

  return makeSuccess(
      "get_amp_sim",
      ampStateToJson(trackId, projectState.ampSimState(trackId), record).dump());
}

CommandResult reconcileManagedAmpSim(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& commandName) {
  const auto tracks = te::getAudioTracks(edit);
  for (auto* track : tracks) {
    if (track != nullptr) {
      clearAmpSimPlugins(*track);
    }
  }

  const auto& uiTracks = projectState.uiTracks();
  for (std::size_t index = 0; index < uiTracks.size(); ++index) {
    if (!projectState.hasAmpSimState(uiTracks[index].id)) {
      continue;
    }
    if (index >= static_cast<std::size_t>(tracks.size()) || tracks[static_cast<int>(index)] == nullptr) {
      return makeError(commandName, "track_not_found", "Track ID is not mapped.");
    }
    const auto result = applyAmpState(
        edit,
        *tracks[static_cast<int>(index)],
        projectState.ampSimState(uiTracks[index].id));
    if (!result.ok) {
      return makeError(commandName, result.errorCode, result.errorMessage);
    }
  }

  return makeSuccess(commandName);
}

}  // namespace musicapp
