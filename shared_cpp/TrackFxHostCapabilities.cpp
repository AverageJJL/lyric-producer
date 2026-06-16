#include "TrackFxHostCapabilities.h"

#ifndef MUSICAPP_ENABLE_EXTERNAL_PLUGIN_HOSTING
#define MUSICAPP_ENABLE_EXTERNAL_PLUGIN_HOSTING 0
#endif

#ifndef JUCE_PLUGINHOST_AU
#define JUCE_PLUGINHOST_AU 0
#endif

#ifndef JUCE_PLUGINHOST_VST3
#define JUCE_PLUGINHOST_VST3 0
#endif

namespace musicapp {

bool ExternalPluginHostCapabilities::anyEnabled() const {
  return au || vst3;
}

ExternalPluginHostCapabilities externalPluginHostCapabilities() {
  return {
      MUSICAPP_ENABLE_EXTERNAL_PLUGIN_HOSTING && JUCE_PLUGINHOST_AU,
      MUSICAPP_ENABLE_EXTERNAL_PLUGIN_HOSTING && JUCE_PLUGINHOST_VST3,
  };
}

bool externalPluginFormatEnabled(const std::string& format) {
  const auto capabilities = externalPluginHostCapabilities();
  if (format == "external_au") {
    return capabilities.au;
  }
  if (format == "external_vst3") {
    return capabilities.vst3;
  }
  return false;
}

std::string externalPluginHostingStatus() {
  return externalPluginHostCapabilities().anyEnabled() ? "enabled" : "disabled";
}

std::string externalPluginRecoveryHint(const std::string& format) {
  if (externalPluginFormatEnabled(format)) {
    return "External host format support is compiled; probe this plugin before inserting it.";
  }
  if (format == "external_au") {
    return "External AU plugin hosting is disabled in this build.";
  }
  return "External VST3 plugin hosting is disabled in this build.";
}

nlohmann::json externalPluginHostFormatsJson() {
  const auto capabilities = externalPluginHostCapabilities();
  return nlohmann::json::array({
      {{"format", "builtin_airwindows"}, {"enabled", true}},
	      {{"format", "external_au"},
	       {"enabled", capabilities.au},
	       {"reason", capabilities.au ? "external_plugin_hosting_enabled" : "external_plugin_hosting_disabled"}},
	      {{"format", "external_vst3"},
	       {"enabled", capabilities.vst3},
	       {"reason", capabilities.vst3 ? "external_plugin_hosting_enabled" : "external_plugin_hosting_disabled"}},
  });
}

}  // namespace musicapp
