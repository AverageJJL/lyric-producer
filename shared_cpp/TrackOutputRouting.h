#pragma once

#include "ProjectState.h"

namespace tracktion { inline namespace engine { class Edit; } }

namespace musicapp {

struct NativeTrackOutputRoutingSummary {
  int directOutputCount = 0;
  int defaultOutputCount = 0;
  int skippedOutputCount = 0;
  int auxSendCount = 0;
  int auxReturnCount = 0;
  int skippedAuxSendCount = 0;
  int skippedAuxReturnCount = 0;
};

NativeTrackOutputRoutingSummary applyNativeTrackOutputRouting(
    tracktion::engine::Edit& edit,
    const ProjectState& projectState);

}  // namespace musicapp
