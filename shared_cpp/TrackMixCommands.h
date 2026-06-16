#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <string>

namespace tracktion { inline namespace engine { class Edit; } }

namespace musicapp {

CommandResult handleGetTrackMix(
    const tracktion::engine::Edit& edit,
    const ProjectState& projectState,
    double masterVolumeDb,
    double masterPan,
    double automationEvaluationBeat,
    const std::string& payloadJson);

}  // namespace musicapp
