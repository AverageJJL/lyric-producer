#pragma once

#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

void applyFourOscPreset(tracktion::engine::FourOscPlugin& plugin, const std::string& presetId);

}  // namespace musicapp
