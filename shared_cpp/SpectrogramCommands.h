#pragma once

#include "AudioInputCapture.h"
#include "CommandTypes.h"
#include "ProjectState.h"

#include <functional>

namespace musicapp {

/** Async mel spectrogram render — ack immediately, complete via onSpectrogramReady. */
CommandResult handleRenderSpectrogram(
    ProjectState& projectState,
    const std::string& payloadJson,
    const EngineEventEmitter& emitEvent);

}  // namespace musicapp
