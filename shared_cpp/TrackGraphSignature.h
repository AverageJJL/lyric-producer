#pragma once

#include "ProjectState.h"

#include <vector>

namespace musicapp {

bool trackGraphTopologyChanged(
    const std::vector<UiTrackRecord>& before,
    const std::vector<UiTrackRecord>& after);

}  // namespace musicapp
