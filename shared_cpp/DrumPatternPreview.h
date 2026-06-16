#pragma once

#include "CommandTypes.h"
#include "InstrumentCommands.h"
#include "ProjectState.h"

#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

CommandResult handleStartPatternPreview(
    tracktion::engine::Engine& engine,
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson,
    const EngineEventEmitter& emitEvent,
    EngineTaskPoster postToEngineThread);

CommandResult handleUpdatePatternPreview(
    const std::string& payloadJson);

CommandResult handleStopPatternPreview();

/** True while the step-sequencer local Play loop is active. */
bool isDrumPatternPreviewActive();

}  // namespace musicapp
