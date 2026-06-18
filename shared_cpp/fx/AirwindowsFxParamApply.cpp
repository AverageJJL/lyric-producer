#include "AirwindowsFxParamApply.h"

#include <algorithm>

namespace musicapp {

namespace {

float clamp01(double value) {
  return static_cast<float>(std::min(1.0, std::max(0.0, value)));
}

}  // namespace

void applyAirwindowsValues(
    AirwinConsolidatedBase& effect,
    const AirwindowsPluginSpec& spec,
    const std::unordered_map<std::string, double>& values) {
  for (std::size_t index = 0; index < spec.params.size(); ++index) {
    const auto& param = spec.params[index];
    const auto found = values.find(param.id);
    const double raw = found != values.end() ? found->second : param.defaultValue;
    effect.setParameter(static_cast<VstInt32>(index), clamp01(raw));
  }
}

std::unordered_map<std::string, double> readAirwindowsValues(
    AirwinConsolidatedBase& effect,
    const AirwindowsPluginSpec& spec) {
  std::unordered_map<std::string, double> values;
  for (std::size_t index = 0; index < spec.params.size(); ++index) {
    values[spec.params[index].id] = effect.getParameter(static_cast<VstInt32>(index));
  }
  return values;
}

}  // namespace musicapp
