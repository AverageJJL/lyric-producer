#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <functional>
#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

using EngineEventEmitter = std::function<void(const std::string& eventName, const std::string& payloadJson)>;

CommandResult handleMidiNoteOn(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult handleMidiNoteOff(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult handleMidiAllNotesOff(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult handlePlaySample(
    tracktion::engine::Engine& engine,
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson,
    EngineDelayedTaskScheduler scheduleOnEngineThread);

CommandResult handleListInstrumentPresets(const std::string& payloadJson);

CommandResult handleSetTrackPreset(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult handleSetRecordArm(ProjectState& projectState, const std::string& payloadJson);

CommandResult handleStartRecording(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson,
    const EngineEventEmitter& emitEvent);

CommandResult handleStopRecording(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson,
    const EngineEventEmitter& emitEvent);

tracktion::engine::FourOscPlugin* findFourOscOnTrack(tracktion::engine::AudioTrack& track);

void applyPresetToTrack(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& trackId,
    const std::string& presetId);

}  // namespace musicapp
