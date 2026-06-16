#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <functional>
#include <string>

#include <nlohmann/json.hpp>
#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

using EngineEventEmitter = std::function<void(const std::string& eventName, const std::string& payloadJson)>;

CommandResult handleStartAudioRecording(
    tracktion::engine::Engine& engine,
    ProjectState& projectState,
    const std::string& payloadJson,
    const EngineEventEmitter& emitEvent);

CommandResult handleStopAudioRecording(
    tracktion::engine::Engine& engine,
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson,
    const EngineEventEmitter& emitEvent);

nlohmann::json listAudioInputDevices();

std::string preferredAudioInputDeviceName();

std::string currentAudioInputDeviceName();

CommandResult handleSetAudioInputDevice(const std::string& payloadJson);

/** True while mic capture is armed (dedicated mic device manager, not Tracktion output). */
bool isAudioCaptureSessionActive();

/** Input device name held by the mic manager — playback must avoid re-opening this endpoint. */
std::string getMicCaptureInputDeviceNameForPlaybackConflict();

/** Tear down mic I/O and reset the dedicated capture manager so BT can leave HFP / transparency. */
void releaseMicCaptureForPlayback();

}  // namespace musicapp
