#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

CommandResult handleValidateFxPluginInsert(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

bool isManagedExternalFxPlugin(tracktion::engine::Plugin* plugin);
std::string managedExternalFxSlotId(tracktion::engine::Plugin* plugin);

CommandResult insertExternalFxPlugin(
    tracktion::engine::Edit& edit,
    tracktion::engine::AudioTrack& track,
    const PluginChainSlotState& chainSlot,
    int insertIndex,
    bool active);

}  // namespace musicapp
