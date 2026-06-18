#pragma once

#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace musicapp {

struct AirwindowsParamSpec {
  std::string id;
  std::string label;
  double defaultValue = 0.5;
};

struct AirwindowsPluginSpec {
  std::string pluginId;
  std::string displayName;
  std::vector<AirwindowsParamSpec> params;
};

const AirwindowsPluginSpec& airwindowsPluginSpecForSlot(const std::string& slotId);

const std::vector<std::pair<std::string, AirwindowsPluginSpec>>& allAirwindowsPluginSpecs();

/** Default plugin id for eq | compressor | reverb rack slots. */
std::string defaultAirwindowsPluginIdForSlot(const std::string& slotId);

std::unordered_map<std::string, double> defaultAirwindowsValuesForSlot(const std::string& slotId);

/** Merge stored values with catalog defaults (unknown keys dropped). */
std::unordered_map<std::string, double> normalizeAirwindowsValues(
    const std::string& pluginId,
    const std::unordered_map<std::string, double>& values);

}  // namespace musicapp
