#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <nlohmann/json.hpp>
#include <optional>
#include <string>

namespace musicapp {

std::optional<CommandResult> parseTrackFxPayload(
    const nlohmann::json& payload,
    TrackFxState& state);

nlohmann::json trackFxStateToJson(const std::string& trackId, const TrackFxState& state);

}  // namespace musicapp
