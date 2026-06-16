#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

CommandResult handleCaptureTrackAutomation(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    double defaultBeat,
    const std::string& payloadJson);

}  // namespace musicapp
