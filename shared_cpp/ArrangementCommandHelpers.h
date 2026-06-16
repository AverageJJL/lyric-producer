#pragma once

#include "ProjectState.h"

#include <string>
#include <utility>
#include <vector>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

tracktion::TimeRange beatRangeToTimeRange(
    tracktion::engine::Edit& edit,
    double startBeat,
    double lengthBeats);

tracktion::engine::ClipPosition beatRangeToClipPosition(
    tracktion::engine::Edit& edit,
    double startBeat,
    double lengthBeats,
    double sourceOffsetBeats);

tracktion::engine::AudioTrack* trackForId(
    tracktion::engine::Edit& edit,
    const ProjectState& projectState,
    const std::string& trackId);

bool hasClipGroup(const std::string& clipId);

void rememberClipGroup(
    const std::string& clipId,
    std::vector<tracktion::engine::Clip*> clips);

void rememberClipGroupEntries(
    const std::string& clipId,
    std::vector<std::pair<std::string, tracktion::engine::Clip*>> clips);

void appendClipGroupEntries(
    const std::string& clipId,
    std::vector<std::pair<std::string, tracktion::engine::Clip*>> clips);

void removeClipGroupEntries(
    const std::string& clipId,
    const std::vector<std::string>& keys);

void removeClipGroup(ProjectState& projectState, const std::string& clipId);

}  // namespace musicapp
