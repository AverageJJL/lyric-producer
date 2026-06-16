#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

CommandResult handleSetTrackFx(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult handleGetTrackFx(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult handleListFxPlugins(const std::string& payloadJson);

CommandResult reconcileManagedTrackFx(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& commandName);

}  // namespace musicapp
