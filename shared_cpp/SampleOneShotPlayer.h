#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace te = tracktion::engine;

namespace musicapp {

/**
 * Timeline beat for live/preview hits — must be past all arrangement clips.
 * Negative beats mis-map to ~0 in Tracktion (see debug transportPosSec: 0).
 */
constexpr double kDrumPreviewRegionStartBeat = 1024.0;

/** Spacing between lane/cell preview hits in the isolated region (one 16th). */
constexpr double kPreviewStepSpacingBeats = 0.25;

/** Local pattern-preview loop length (one bar). */
constexpr double kPreviewPatternBeats = 4.0;

/** Stop preview transport and return the edit to linear song playback. */
void restoreLinearTransport(te::Edit& edit, double restoreBeat);

/** Invalidate queued one-shot audition cleanup tasks before engine teardown. */
void cancelSampleOneShotAuditions();

/** One-shot lane/cell audition in the isolated preview region (optional 16th step index). */
CommandResult triggerSampleOneShot(
    te::Engine& engine,
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& trackId,
    const std::string& sampleKey,
    int stepIndex,
    EngineDelayedTaskScheduler scheduleOnEngineThread);

/** Place a preview-region hit at an explicit beat (pattern preview steps). */
CommandResult triggerSampleOneShotAtBeat(
    te::Engine& engine,
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& trackId,
    const std::string& sampleKey,
    double beat,
    bool oneShotAudition,
    EngineDelayedTaskScheduler scheduleOnEngineThread);

/**
 * Place a pattern-loop clip in the isolated preview region without touching transport.
 * Used for local drum-machine Play so playback matches arrangement (no per-step seek).
 */
bool insertDrumPreviewClip(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& trackId,
    const std::string& sampleKey,
    int stepIndex,
    double beat);

/** Remove __preview__ clips from one audio track. */
void clearPreviewClipsOnTrack(te::AudioTrack& track);

/** Remove __preview__ clips from every mapped audio track. */
void clearAllPreviewClips(te::Edit& edit, const ProjectState& projectState);

}  // namespace musicapp
