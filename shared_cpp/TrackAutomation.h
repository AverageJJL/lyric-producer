#pragma once

#include "ProjectState.h"

#include <optional>
#include <string>

namespace musicapp {

bool trackAutomationReadEnabled(const UiTrackRecord& track);

bool trackAutomationWriteCaptureEnabled(const UiTrackRecord& track);

const UiTrackAutomationLane* findTrackAutomationLane(
    const UiTrackRecord& track,
    const std::string& targetType,
    const std::string& parameterId);

double evaluateAutomationLaneValue(
    const UiTrackAutomationLane& lane,
    double beat,
    double fallback);

std::optional<double> evaluateReadableTrackAutomation(
    const UiTrackRecord& track,
    const std::string& parameterId,
    double beat);

bool hasReadableTrackAutomation(const UiTrackRecord& track);

double automationAppliedTrackVolumeDb(const UiTrackRecord& track, double beat);

double automationAppliedTrackPan(const UiTrackRecord& track, double beat);

}  // namespace musicapp
