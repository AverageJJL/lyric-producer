#include "MusicAppAirwindowsFactory.h"

#include "autogen_airwin/Logical4.h"
#include "autogen_airwin/MatrixVerb.h"
#include "autogen_airwin/Parametric.h"

namespace musicapp {

namespace {

std::string stripPrefix(const std::string& pluginId) {
  constexpr char kPrefix[] = "airwindows:";
  if (pluginId.rfind(kPrefix, 0) == 0) {
    return pluginId.substr(sizeof(kPrefix) - 1);
  }
  return pluginId;
}

}  // namespace

std::string normalizeAirwindowsEffectId(const std::string& pluginId) {
  return stripPrefix(pluginId);
}

std::unique_ptr<AirwinConsolidatedBase> createAirwindowsEffect(const std::string& effectName) {
  const auto name = stripPrefix(effectName);
  if (name == "Parametric") {
    return std::make_unique<airwinconsolidated::Parametric::Parametric>(0);
  }
  if (name == "Logical4") {
    return std::make_unique<airwinconsolidated::Logical4::Logical4>(0);
  }
  if (name == "MatrixVerb") {
    return std::make_unique<airwinconsolidated::MatrixVerb::MatrixVerb>(0);
  }
  return nullptr;
}

}  // namespace musicapp
