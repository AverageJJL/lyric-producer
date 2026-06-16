#pragma once

#include "ProjectState.h"

namespace tracktion { inline namespace engine { class Edit; } }

namespace musicapp {

struct NativeTrackSidechainRoutingSummary {
  int requestedTrackCount = 0;
  int appliedTrackCount = 0;
  int appliedPluginCount = 0;
  int skippedTrackCount = 0;
};

NativeTrackSidechainRoutingSummary applyNativeTrackSidechainRouting(
    tracktion::engine::Edit& edit,
    const ProjectState& projectState);

}  // namespace musicapp
