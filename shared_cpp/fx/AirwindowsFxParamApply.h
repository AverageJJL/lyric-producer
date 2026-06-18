#pragma once

#include "AirwindowsFxCatalog.h"
#include "airwin_consolidated_base.h"

#include <unordered_map>

namespace musicapp {

void applyAirwindowsValues(
    AirwinConsolidatedBase& effect,
    const AirwindowsPluginSpec& spec,
    const std::unordered_map<std::string, double>& values);

std::unordered_map<std::string, double> readAirwindowsValues(
    AirwinConsolidatedBase& effect,
    const AirwindowsPluginSpec& spec);

}  // namespace musicapp
