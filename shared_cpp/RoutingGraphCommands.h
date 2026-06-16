#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <string>

namespace musicapp {

CommandResult handleGetRoutingGraph(
    const ProjectState& projectState,
    const std::string& payloadJson);

}  // namespace musicapp
