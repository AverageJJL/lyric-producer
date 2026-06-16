#pragma once

#include <nlohmann/json.hpp>

#include <string>

namespace musicapp {

struct ExternalPluginHostCapabilities {
  bool au = false;
  bool vst3 = false;

  bool anyEnabled() const;
};

ExternalPluginHostCapabilities externalPluginHostCapabilities();
bool externalPluginFormatEnabled(const std::string& format);
std::string externalPluginHostingStatus();
std::string externalPluginRecoveryHint(const std::string& format);
nlohmann::json externalPluginHostFormatsJson();

}  // namespace musicapp
