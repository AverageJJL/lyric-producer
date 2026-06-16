#pragma once

#include "ProjectState.h"

#include <nlohmann/json.hpp>
#include <tracktion_engine/tracktion_engine.h>

#include <string>

namespace musicapp {

namespace te = tracktion::engine;

std::string nativeRoutingOutputTrackId(
    const ProjectState& projectState,
    const juce::Array<te::AudioTrack*>& nativeTracks,
    te::AudioTrack* nativeTrack);

int nativeAuxReturnBusNumber(te::AudioTrack* nativeTrack);

nlohmann::json nativeAuxSendsJson(
    const ProjectState& projectState,
    te::AudioTrack* nativeTrack);

nlohmann::json nativeSidechainPluginsJson(
    const ProjectState& projectState,
    const juce::Array<te::AudioTrack*>& nativeTracks,
    te::AudioTrack* nativeTrack);

}  // namespace musicapp
