#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

CommandResult handleSetTrackInstrumentParam(
    tracktion::engine::Edit& edit,
    const ProjectState& projectState,
    const std::string& payloadJson);

}  // namespace musicapp
