#pragma once

#include <juce_audio_processors_headless/juce_audio_processors_headless.h>
#include <nlohmann/json.hpp>

#include <memory>
#include <string>

namespace musicapp {

bool isExternalPluginFormat(const std::string& format);
std::string externalPluginFormatForPath(const std::string& path);
std::string externalPluginPathFromPluginId(const std::string& pluginId, const std::string& format);
std::unique_ptr<juce::PluginDescription> findExternalPluginDescriptionForFile(
    const std::string& path,
    const std::string& format);
nlohmann::json externalPluginDescriptionJson(const juce::PluginDescription& description);

}  // namespace musicapp
