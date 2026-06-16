#include "TrackFxExternalPluginDescription.h"

#include <algorithm>
#include <cctype>

namespace musicapp {

namespace {

std::string lowerAscii(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
    return static_cast<char>(std::tolower(ch));
  });
  return value;
}

std::string juceString(const juce::String& value) {
  return value.toStdString();
}

std::string juceFormatNameFor(const std::string& format) {
  if (format == "external_au") {
    return "AudioUnit";
  }
  if (format == "external_vst3") {
    return "VST3";
  }
  return {};
}

juce::AudioPluginFormat* findJuceFormat(
    juce::AudioPluginFormatManager& manager,
    const std::string& format) {
  const auto desiredName = juceFormatNameFor(format);
  for (auto* candidate : manager.getFormats()) {
    if (candidate != nullptr && juceString(candidate->getName()) == desiredName) {
      return candidate;
    }
  }
  return nullptr;
}

}  // namespace

bool isExternalPluginFormat(const std::string& format) {
  return format == "external_au" || format == "external_vst3";
}

std::string externalPluginFormatForPath(const std::string& path) {
  const auto lower = lowerAscii(path);
  if (lower.size() >= 5 && lower.rfind(".vst3") == lower.size() - 5) {
    return "external_vst3";
  }
  if (lower.size() >= 10 && lower.rfind(".component") == lower.size() - 10) {
    return "external_au";
  }
  return {};
}

std::string externalPluginPathFromPluginId(const std::string& pluginId, const std::string& format) {
  const auto prefix = format + ":";
  return pluginId.rfind(prefix, 0) == 0 ? pluginId.substr(prefix.size()) : std::string{};
}

std::unique_ptr<juce::PluginDescription> findExternalPluginDescriptionForFile(
    const std::string& path,
    const std::string& format) {
  if (path.empty() || !isExternalPluginFormat(format)) {
    return {};
  }

  juce::AudioPluginFormatManager manager;
  juce::addHeadlessDefaultFormatsToManager(manager);
  auto* juceFormat = findJuceFormat(manager, format);
  if (juceFormat == nullptr) {
    return {};
  }

  juce::OwnedArray<juce::PluginDescription> descriptions;
  juceFormat->findAllTypesForFile(descriptions, juce::String(path));
  if (descriptions.isEmpty()) {
    return {};
  }
  return std::make_unique<juce::PluginDescription>(*descriptions.getFirst());
}

nlohmann::json externalPluginDescriptionJson(const juce::PluginDescription& description) {
  return {
      {"name", juceString(description.name)},
      {"descriptiveName", juceString(description.descriptiveName)},
      {"formatName", juceString(description.pluginFormatName)},
      {"category", juceString(description.category)},
      {"manufacturerName", juceString(description.manufacturerName)},
      {"version", juceString(description.version)},
      {"fileOrIdentifier", juceString(description.fileOrIdentifier)},
      {"identifier", juceString(description.createIdentifierString())},
      {"uniqueId", description.uniqueId},
      {"isInstrument", description.isInstrument},
      {"inputChannels", description.numInputChannels},
      {"outputChannels", description.numOutputChannels},
      {"hasARAExtension", description.hasARAExtension},
  };
}

}  // namespace musicapp
