#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

CommandResult handleStartMidiPhrasePreview(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult handleStopMidiPhrasePreview();

bool isMidiPhrasePreviewActive();

}  // namespace musicapp
