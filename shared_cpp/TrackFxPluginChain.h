#pragma once

#include "ProjectState.h"

#include <nlohmann/json.hpp>
#include <optional>
#include <vector>

namespace musicapp {

std::optional<PluginChainSlotState> parsePluginChainSlot(
    const TrackFxState& state,
    const nlohmann::json& json,
    int fallbackOrder);

std::vector<PluginChainSlotState> normalizePluginChain(const TrackFxState& state);

bool chainSlotCanUseManagedNativePlugin(const PluginChainSlotState& chainSlot);
bool chainSlotCanUseExternalNativePlugin(const PluginChainSlotState& chainSlot);

nlohmann::json pluginChainToJson(const TrackFxState& state);

}  // namespace musicapp
