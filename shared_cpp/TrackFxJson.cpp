#include "TrackFxJson.h"

#include "JsonResponse.h"
#include "TrackFxPluginChain.h"
#include "fx/AirwindowsFxCatalog.h"

#include <algorithm>
#include <unordered_set>
#include <utility>

namespace musicapp {

namespace {

constexpr int kRequiredSlotCount = 3;

double clamp(double value, double minValue, double maxValue) {
  return std::min(maxValue, std::max(minValue, value));
}

bool hasNumber(const nlohmann::json& json, const char* key) {
  return json.contains(key) && json[key].is_number();
}

bool isPluginParamsShape(const nlohmann::json& params) {
  return params.contains("pluginId") && params["pluginId"].is_string()
         && params.contains("values") && params["values"].is_object();
}

std::unordered_map<std::string, double> parseValuesObject(const nlohmann::json& valuesJson) {
  std::unordered_map<std::string, double> values;
  for (auto it = valuesJson.begin(); it != valuesJson.end(); ++it) {
    if (it.value().is_number()) {
      values[it.key()] = clamp(it.value().get<double>(), 0.0, 1.0);
    }
  }
  return values;
}

PluginFxParamsState parsePluginParams(
    const std::string& slotId,
    const nlohmann::json& params) {
  PluginFxParamsState parsed;
  parsed.pluginId = defaultAirwindowsPluginIdForSlot(slotId);
  parsed.values = defaultAirwindowsValuesForSlot(slotId);

  if (isPluginParamsShape(params)) {
    parsed.pluginId = params["pluginId"].get<std::string>();
    try {
      parsed.values = normalizeAirwindowsValues(parsed.pluginId, parseValuesObject(params["values"]));
    } catch (...) {
      // Unsupported plugin IDs are recovered through pluginChain metadata; the
      // fixed native rack still needs safe managed defaults for DSP parameters.
      parsed.pluginId = defaultAirwindowsPluginIdForSlot(slotId);
      parsed.values = defaultAirwindowsValuesForSlot(slotId);
    }
    return parsed;
  }

  if (slotId == "eq" && params.contains("bands") && params["bands"].is_array()) {
    return parsed;
  }

  if (slotId == "compressor" && hasNumber(params, "threshold")) {
    const double threshold = params["threshold"].get<double>();
    const double ratio = hasNumber(params, "ratio") ? params["ratio"].get<double>() : 4.0;
    const double attack = hasNumber(params, "attack") ? params["attack"].get<double>() : 10.0;
    parsed.values["threshold"] = clamp((threshold + 20.0) / 40.0, 0.0, 1.0);
    parsed.values["ratio"] = clamp(std::sqrt((ratio - 1.0) / 15.0), 0.0, 1.0);
    parsed.values["speed"] = clamp(std::sqrt((attack - 1.0) / 99.0), 0.0, 1.0);
    parsed.values["dryWet"] = 1.0;
    return parsed;
  }

  if (slotId == "reverb" && hasNumber(params, "size")) {
    parsed.values["roomSize"] = clamp(params["size"].get<double>(), 0.0, 1.0);
    if (hasNumber(params, "mix")) {
      parsed.values["dryWet"] = clamp(params["mix"].get<double>(), 0.0, 1.0);
    }
    if (hasNumber(params, "preDelay")) {
      parsed.values["damping"] = clamp(params["preDelay"].get<double>() / 200.0, 0.0, 1.0);
    }
    return parsed;
  }

  return parsed;
}

nlohmann::json pluginSlotToJson(
    const std::string& slotId,
    bool enabled,
    const PluginFxParamsState& params) {
  nlohmann::json values = nlohmann::json::object();
  for (const auto& entry : params.values) {
    values[entry.first] = entry.second;
  }
  return {
      {"slot", slotId},
      {"enabled", enabled},
      {"params", {{"pluginId", params.pluginId}, {"values", values}}},
  };
}

}  // namespace

std::optional<CommandResult> parseTrackFxPayload(
    const nlohmann::json& payload,
    TrackFxState& state) {
  if (!payload.contains("slots") || !payload["slots"].is_array()) {
    return makeError("set_track_fx", "invalid_payload", "Expected slots array.");
  }

  std::unordered_set<std::string> seenSlots;
  for (const auto& slotJson : payload["slots"]) {
    if (!slotJson.is_object() || !slotJson.contains("slot") || !slotJson["slot"].is_string()
        || !slotJson.contains("enabled") || !slotJson["enabled"].is_boolean()
        || !slotJson.contains("params") || !slotJson["params"].is_object()) {
      return makeError("set_track_fx", "invalid_payload", "FX slots require slot, enabled, params.");
    }

    const auto slot = slotJson["slot"].get<std::string>();
    if (!seenSlots.insert(slot).second) {
      return makeError("set_track_fx", "invalid_payload", "Duplicate FX slot.");
    }

    const auto parsedParams = parsePluginParams(slot, slotJson["params"]);
    if (slot == "eq") {
      state.eqEnabled = slotJson["enabled"].get<bool>();
      state.eq = parsedParams;
    } else if (slot == "compressor") {
      state.compressorEnabled = slotJson["enabled"].get<bool>();
      state.compressor = parsedParams;
    } else if (slot == "reverb") {
      state.reverbEnabled = slotJson["enabled"].get<bool>();
      state.reverb = parsedParams;
    } else {
      return makeError("set_track_fx", "invalid_payload", "Unknown FX slot.");
    }
  }

  if (seenSlots.size() != kRequiredSlotCount || seenSlots.find("eq") == seenSlots.end()
      || seenSlots.find("compressor") == seenSlots.end()
      || seenSlots.find("reverb") == seenSlots.end()) {
    return makeError(
        "set_track_fx",
        "invalid_payload",
        "FX payload requires eq, compressor, and reverb slots.");
  }

  state.pluginChain.clear();
  if (payload.contains("pluginChain")) {
    if (!payload["pluginChain"].is_array()) {
      return makeError("set_track_fx", "invalid_payload", "pluginChain must be an array.");
    }

    std::unordered_set<std::string> seenChainSlots;
    int fallbackOrder = 0;
    for (const auto& chainSlotJson : payload["pluginChain"]) {
      auto parsed = parsePluginChainSlot(state, chainSlotJson, fallbackOrder++);
      if (!parsed || !seenChainSlots.insert(parsed->slot).second) {
        return makeError("set_track_fx", "invalid_payload", "Invalid pluginChain slot.");
      }
      state.pluginChain.push_back(std::move(*parsed));
    }
  }
  state.pluginChain = normalizePluginChain(state);

  return std::nullopt;
}

nlohmann::json trackFxStateToJson(const std::string& trackId, const TrackFxState& state) {
  nlohmann::json slots = nlohmann::json::array();
  slots.push_back(pluginSlotToJson("eq", state.eqEnabled, state.eq));
  slots.push_back(pluginSlotToJson("compressor", state.compressorEnabled, state.compressor));
  slots.push_back(pluginSlotToJson("reverb", state.reverbEnabled, state.reverb));
  return {{"trackId", trackId}, {"slots", slots}, {"pluginChain", pluginChainToJson(state)}};
}

}  // namespace musicapp
