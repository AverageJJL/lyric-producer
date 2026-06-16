#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

CommandResult handleSetAmpSim(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult handleGetAmpSim(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult reconcileManagedAmpSim(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& commandName);

}  // namespace musicapp
