#pragma once

#include <juce_core/juce_core.h>
#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

/** Minimum clip length: one 16th note in a 4/4 bar. */
constexpr double kMinDrumClipBeats = 0.25;

/** Read duration from a PCM WAV header without registering audio formats. */
bool readWavDurationSeconds(const juce::File& file, double& outSeconds);

/** Clip length in beats from file duration and project tempo (at least one 16th). */
double drumClipDurationBeats(
    const juce::File& file,
    const tracktion::engine::TempoSequence& tempoSequence);

}  // namespace musicapp
