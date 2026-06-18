#pragma once

#include "airwin_consolidated_base.h"

#include <memory>
#include <string>

namespace musicapp {

/** Creates one of the three built-in Airwindows processors used by MusicApp FX slots. */
std::unique_ptr<AirwinConsolidatedBase> createAirwindowsEffect(const std::string& effectName);

/** Strips optional `airwindows:` prefix for registry lookup. */
std::string normalizeAirwindowsEffectId(const std::string& pluginId);

}  // namespace musicapp
