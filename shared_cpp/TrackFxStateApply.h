#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <nlohmann/json.hpp>
#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

CommandResult applyFxState(
    tracktion::engine::Edit& edit,
    tracktion::engine::AudioTrack& track,
    const TrackFxState& state);

nlohmann::json trackFxResponseJson(
    const std::string& trackId,
    const TrackFxState& state,
    tracktion::engine::AudioTrack& track);

}  // namespace musicapp
