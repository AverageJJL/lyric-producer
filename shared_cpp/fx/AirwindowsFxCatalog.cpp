#include "AirwindowsFxCatalog.h"

#include "MusicAppAirwindowsFactory.h"

#include <stdexcept>

namespace musicapp {

namespace {

const AirwindowsPluginSpec kParametric{
    "airwindows:Parametric",
    "Parametric",
    {
        {"trFreq", "Tr Freq", 0.5},
        {"treble", "Treble", 0.5},
        {"trReso", "Tr Reso", 0.5},
        {"hmFreq", "HM Freq", 0.5},
        {"highMid", "HighMid", 0.5},
        {"hmReso", "HM Reso", 0.5},
        {"lmFreq", "LM Freq", 0.5},
        {"lowMid", "LowMid", 0.5},
        {"lmReso", "LM Reso", 0.5},
        {"dryWet", "Dry/Wet", 1.0},
    },
};

const AirwindowsPluginSpec kLogical4{
    "airwindows:Logical4",
    "Logical4",
    {
        {"threshold", "Threshold", 0.5},
        {"ratio", "Ratio", 0.2},
        {"speed", "Speed", 0.192},
        {"makeupGain", "MakeupGn", 0.5},
        {"dryWet", "Dry/Wet", 1.0},
    },
};

const AirwindowsPluginSpec kMatrixVerb{
    "airwindows:MatrixVerb",
    "MatrixVerb",
    {
        {"filter", "Filter", 0.5},
        {"damping", "Damping", 0.5},
        {"speed", "Speed", 0.5},
        {"vibrato", "Vibrato", 0.5},
        {"roomSize", "RmSize", 0.5},
        {"flavor", "Flavor", 0.5},
        {"dryWet", "Dry/Wet", 0.5},
    },
};

const AirwindowsPluginSpec& specForPluginId(const std::string& pluginId) {
  const auto normalized = normalizeAirwindowsEffectId(pluginId);
  if (normalized == "Parametric") {
    return kParametric;
  }
  if (normalized == "Logical4") {
    return kLogical4;
  }
  if (normalized == "MatrixVerb") {
    return kMatrixVerb;
  }
  throw std::invalid_argument("unknown airwindows plugin");
}

const std::vector<std::pair<std::string, AirwindowsPluginSpec>> kManagedPlugins{
    {"eq", kParametric},
    {"compressor", kLogical4},
    {"reverb", kMatrixVerb},
};

}  // namespace

const AirwindowsPluginSpec& airwindowsPluginSpecForSlot(const std::string& slotId) {
  if (slotId == "eq") {
    return kParametric;
  }
  if (slotId == "compressor") {
    return kLogical4;
  }
  if (slotId == "reverb") {
    return kMatrixVerb;
  }
  throw std::invalid_argument("unknown fx slot");
}

const std::vector<std::pair<std::string, AirwindowsPluginSpec>>& allAirwindowsPluginSpecs() {
  return kManagedPlugins;
}

std::string defaultAirwindowsPluginIdForSlot(const std::string& slotId) {
  return airwindowsPluginSpecForSlot(slotId).pluginId;
}

std::unordered_map<std::string, double> defaultAirwindowsValuesForSlot(const std::string& slotId) {
  std::unordered_map<std::string, double> values;
  for (const auto& param : airwindowsPluginSpecForSlot(slotId).params) {
    values[param.id] = param.defaultValue;
  }
  return values;
}

std::unordered_map<std::string, double> normalizeAirwindowsValues(
    const std::string& pluginId,
    const std::unordered_map<std::string, double>& values) {
  const auto& spec = specForPluginId(pluginId);
  std::unordered_map<std::string, double> normalized;
  for (const auto& param : spec.params) {
    const auto found = values.find(param.id);
    normalized[param.id] = found != values.end() ? found->second : param.defaultValue;
  }
  return normalized;
}

}  // namespace musicapp
