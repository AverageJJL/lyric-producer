#pragma once

#include "CommandTypes.h"
#include "MusicAppSamplerPlugin.h"
#include "ProjectState.h"

#include <nlohmann/json_fwd.hpp>
#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

MusicAppSamplerPlugin* findSamplerOnTrack(tracktion::engine::AudioTrack& track);
bool isSamplerInstrumentPlugin(tracktion::engine::Plugin* plugin);
void removeSamplerPlugins(tracktion::engine::AudioTrack& track);

CommandResult configureSamplerInstrument(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    tracktion::engine::AudioTrack& track,
    const std::string& trackId,
    const nlohmann::json& payload);

}  // namespace musicapp
