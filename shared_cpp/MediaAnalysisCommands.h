#pragma once

#include "CommandTypes.h"

#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

CommandResult handleAnalyzeAudioFile(
    tracktion::engine::Edit& edit,
    const std::string& payloadJson);

CommandResult handleDetectAudioTransients(
    tracktion::engine::Edit& edit,
    const std::string& payloadJson);

}  // namespace musicapp
