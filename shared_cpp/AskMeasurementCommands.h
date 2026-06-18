#pragma once

#include <string>

#include "CommandTypes.h"

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

class ProjectState;

/**
 * Read-only audio measurement commands used by the Copilot "Ask" mode. Both resolve a
 * relative clip path under the project asset root, decode the audible clip SEGMENT and
 * return JSON numbers only — no playback, no state mutation, no audio bytes leave the
 * engine. The clip's beat geometry (startBeat, lengthBeats, sourceOffsetBeats,
 * sourceLengthBeats, isReversed, fade*Beats, clipGainDb) is converted to a source-seconds
 * window through the SAME edit tempo sequence + ClipPosition math playback uses, so the
 * measured region matches what the user hears under tempo maps and reverse. Omit the beat
 * fields to measure the whole file.
 *
 *  measure_loudness   { audioPath, startBeat?, lengthBeats?, ... } -> { integratedLufs,
 *                                shortTermLufs, momentaryLufs, rmsDb, peakDb, ... }
 *  get_spectrum_bands { audioPath, loudnessMatch?, startBeat?, ... } -> { sampleRate,
 *                                integratedRmsDb, bands: [{ lowHz, highHz, energyDb }] }
 */
CommandResult handleMeasureLoudness(
    tracktion::engine::Edit& edit, const ProjectState& projectState, const std::string& payloadJson);
CommandResult handleGetSpectrumBands(
    tracktion::engine::Edit& edit, const ProjectState& projectState, const std::string& payloadJson);

}  // namespace musicapp
