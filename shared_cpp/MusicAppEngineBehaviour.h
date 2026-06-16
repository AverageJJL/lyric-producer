#pragma once

#include <memory>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

std::unique_ptr<tracktion::engine::EngineBehaviour> createMusicAppEngineBehaviour();

}  // namespace musicapp
