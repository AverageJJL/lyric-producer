#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

CommandResult handleSetAssetRoot(ProjectState& projectState, const std::string& payloadJson);

CommandResult handleAssignTrackInstrument(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult handleUpsertMidiClip(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult handleUpsertAudioClip(
    tracktion::engine::Engine& engine,
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult handleSetDrumPatternStep(
    tracktion::engine::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson);

CommandResult handleDeleteClip(ProjectState& projectState, const std::string& payloadJson);

CommandResult handleSetLoopRange(tracktion::engine::Edit& edit, const std::string& payloadJson);

void applyTrackMixState(
    tracktion::engine::Edit& edit,
    const ProjectState& projectState,
    double automationEvaluationBeat);

void removeClipGroup(ProjectState& projectState, const std::string& clipId);

}  // namespace musicapp
