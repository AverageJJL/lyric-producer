#include "TrackFxPluginChain.h"

#include "TrackFxExternalPluginDescription.h"
#include "TrackFxHostCapabilities.h"
#include "fx/AirwindowsFxCatalog.h"

#include <algorithm>
#include <unordered_set>

namespace musicapp {

namespace {

bool isKnownSlot(const std::string& slot) {
  return slot == "eq" || slot == "compressor" || slot == "reverb";
}

std::string slotDisplayName(const std::string& slot) {
  if (slot == "eq") {
    return "Parametric";
  }
  if (slot == "compressor") {
    return "Logical4";
  }
  if (slot == "reverb") {
    return "MatrixVerb";
  }
  return slot;
}

bool slotEnabled(const TrackFxState& state, const std::string& slot) {
  if (slot == "eq") {
    return state.eqEnabled;
  }
  if (slot == "compressor") {
    return state.compressorEnabled;
  }
  if (slot == "reverb") {
    return state.reverbEnabled;
  }
  return false;
}

std::string slotPluginId(const TrackFxState& state, const std::string& slot) {
  if (slot == "eq") {
    return state.eq.pluginId;
  }
  if (slot == "compressor") {
    return state.compressor.pluginId;
  }
  if (slot == "reverb") {
    return state.reverb.pluginId;
  }
  return defaultAirwindowsPluginIdForSlot(slot);
}

std::string normalizedHostFormat(const std::string& format) {
  return format == "external_au" || format == "external_vst3"
      ? format
      : std::string{"builtin_airwindows"};
}

std::string normalizedHostStatus(const std::string& status) {
  return status == "missing" || status == "disabled" ? status : std::string{"available"};
}

std::string externalHostingHint(const std::string& format) {
  return externalPluginRecoveryHint(format);
}

std::string externalMissingHint() {
  return "External plugin could not be loaded from the saved path. Re-scan or recover the plugin.";
}

std::string managedSlotRecoveryHint(const PluginChainSlotState& chainSlot) {
  return "Only the built-in " + slotDisplayName(chainSlot.slot) +
      " processor can be hosted in this slot.";
}

PluginChainSlotState withHostRecoveryState(PluginChainSlotState chainSlot) {
  if (chainSlot.format == "external_au" || chainSlot.format == "external_vst3") {
    if (externalPluginFormatEnabled(chainSlot.format)) {
      const auto path = externalPluginPathFromPluginId(chainSlot.pluginId, chainSlot.format);
      const auto description = findExternalPluginDescriptionForFile(path, chainSlot.format);
      if (description == nullptr) {
        chainSlot.status = "missing";
        if (chainSlot.recoveryHint.empty()) {
          chainSlot.recoveryHint = externalMissingHint();
        }
        return chainSlot;
      }

      if (chainSlot.status != "available") {
        chainSlot.status = "available";
      }
      chainSlot.recoveryHint.clear();
      return chainSlot;
    }

    if (chainSlot.status == "available") {
      chainSlot.status = "disabled";
    }
    if (chainSlot.recoveryHint.empty()) {
      chainSlot.recoveryHint = externalHostingHint(chainSlot.format);
    }
    return chainSlot;
  }

  if (chainSlot.pluginId != defaultAirwindowsPluginIdForSlot(chainSlot.slot)) {
    if (chainSlot.status == "available") {
      chainSlot.status = "missing";
    }
    if (chainSlot.recoveryHint.empty()) {
      chainSlot.recoveryHint = managedSlotRecoveryHint(chainSlot);
    }
  }
  return chainSlot;
}

PluginChainSlotState defaultChainSlot(
    const TrackFxState& state,
    const std::string& slot,
    int order) {
  PluginChainSlotState chainSlot;
  chainSlot.slot = slot;
  chainSlot.pluginId = slotPluginId(state, slot);
  chainSlot.displayName = slotDisplayName(slot);
  chainSlot.enabled = slotEnabled(state, slot);
  chainSlot.bypassed = !chainSlot.enabled;
  chainSlot.order = order;
  return chainSlot;
}

}  // namespace

std::optional<PluginChainSlotState> parsePluginChainSlot(
    const TrackFxState& state,
    const nlohmann::json& json,
    int fallbackOrder) {
  if (!json.is_object() || !json.contains("slot") || !json["slot"].is_string()) {
    return std::nullopt;
  }

  const auto slot = json["slot"].get<std::string>();
  if (!isKnownSlot(slot)) {
    return std::nullopt;
  }

  auto chainSlot = defaultChainSlot(state, slot, fallbackOrder);
  if (json.contains("pluginId") && json["pluginId"].is_string()
      && !json["pluginId"].get<std::string>().empty()) {
    chainSlot.pluginId = json["pluginId"].get<std::string>();
  }
  if (json.contains("displayName") && json["displayName"].is_string()
      && !json["displayName"].get<std::string>().empty()) {
    chainSlot.displayName = json["displayName"].get<std::string>();
  }
  if (json.contains("format") && json["format"].is_string()) {
    chainSlot.format = normalizedHostFormat(json["format"].get<std::string>());
  }
  if (json.contains("enabled") && json["enabled"].is_boolean()) {
    chainSlot.enabled = json["enabled"].get<bool>();
  }
  if (json.contains("bypassed") && json["bypassed"].is_boolean()) {
    chainSlot.bypassed = json["bypassed"].get<bool>();
  } else {
    chainSlot.bypassed = !chainSlot.enabled;
  }
  if (json.contains("order") && json["order"].is_number_integer()) {
    chainSlot.order = std::max(0, json["order"].get<int>());
  }
  if (json.contains("status") && json["status"].is_string()) {
    chainSlot.status = normalizedHostStatus(json["status"].get<std::string>());
  }
  if (json.contains("recoveryHint") && json["recoveryHint"].is_string()) {
    chainSlot.recoveryHint = json["recoveryHint"].get<std::string>();
  }
  return withHostRecoveryState(chainSlot);
}

std::vector<PluginChainSlotState> normalizePluginChain(const TrackFxState& state) {
  std::vector<PluginChainSlotState> chain;
  std::unordered_set<std::string> seen;

  for (const auto& slot : state.pluginChain) {
    if (!isKnownSlot(slot.slot) || !seen.insert(slot.slot).second) {
      continue;
    }
    chain.push_back(withHostRecoveryState(slot));
  }

  const std::vector<std::string> requiredSlots = {"eq", "compressor", "reverb"};
  for (const auto& slot : requiredSlots) {
    if (seen.insert(slot).second) {
      chain.push_back(defaultChainSlot(state, slot, static_cast<int>(chain.size())));
    }
  }

  std::sort(chain.begin(), chain.end(), [](const auto& left, const auto& right) {
    return left.order < right.order;
  });
  for (int index = 0; index < static_cast<int>(chain.size()); ++index) {
    chain[static_cast<std::size_t>(index)].order = index;
  }
  return chain;
}

bool chainSlotCanUseManagedNativePlugin(const PluginChainSlotState& chainSlot) {
  return isKnownSlot(chainSlot.slot) &&
      chainSlot.format == "builtin_airwindows" &&
      chainSlot.status == "available" &&
      chainSlot.pluginId == defaultAirwindowsPluginIdForSlot(chainSlot.slot);
}

bool chainSlotCanUseExternalNativePlugin(const PluginChainSlotState& chainSlot) {
  return isKnownSlot(chainSlot.slot) &&
      (chainSlot.format == "external_au" || chainSlot.format == "external_vst3") &&
      chainSlot.status == "available" &&
      externalPluginFormatEnabled(chainSlot.format) &&
      !externalPluginPathFromPluginId(chainSlot.pluginId, chainSlot.format).empty();
}

nlohmann::json pluginChainToJson(const TrackFxState& state) {
  nlohmann::json chain = nlohmann::json::array();
  for (const auto& slot : normalizePluginChain(state)) {
    nlohmann::json item = {
        {"slot", slot.slot},
        {"pluginId", slot.pluginId},
        {"displayName", slot.displayName},
        {"format", slot.format},
        {"enabled", slot.enabled},
        {"bypassed", slot.bypassed},
        {"order", slot.order},
        {"status", slot.status},
    };
    if (!slot.recoveryHint.empty()) {
      item["recoveryHint"] = slot.recoveryHint;
    }
    chain.push_back(item);
  }
  return chain;
}

}  // namespace musicapp
