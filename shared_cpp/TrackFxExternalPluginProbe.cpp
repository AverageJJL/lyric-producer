#include "TrackFxExternalPluginProbe.h"

#include "JsonResponse.h"
#include "TrackFxHostCapabilities.h"

#include <juce_audio_processors_headless/juce_audio_processors_headless.h>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <cmath>
#include <optional>
#include <string>

namespace musicapp {

namespace {

struct ProbeOptions {
  std::string path;
  std::string format;
  double sampleRate = 44100.0;
  int blockSize = 512;
  bool instantiate = false;
};

std::string juceString(const juce::String& value) {
  return value.toStdString();
}

bool isSupportedFormat(const std::string& format) {
  return format == "external_au" || format == "external_vst3";
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

nlohmann::json descriptionJson(const juce::PluginDescription& description) {
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

std::optional<ProbeOptions> parseProbeOptions(
    const nlohmann::json& payload,
    std::string& errorMessage) {
  ProbeOptions options;
  const auto path = payload.find("path");
  const auto format = payload.find("format");
  if (path == payload.end() || !path->is_string() || path->get<std::string>().empty()) {
    errorMessage = "path must be a non-empty string.";
    return std::nullopt;
  }
  if (format == payload.end() || !format->is_string()) {
    errorMessage = "format must be external_au or external_vst3.";
    return std::nullopt;
  }

  options.path = path->get<std::string>();
  options.format = format->get<std::string>();
  if (!isSupportedFormat(options.format)) {
    errorMessage = "format must be external_au or external_vst3.";
    return std::nullopt;
  }

  if (payload.contains("sampleRate")) {
    if (!payload["sampleRate"].is_number()) {
      errorMessage = "sampleRate must be a positive finite number.";
      return std::nullopt;
    }
    options.sampleRate = payload["sampleRate"].get<double>();
    if (!std::isfinite(options.sampleRate) || options.sampleRate <= 0.0) {
      errorMessage = "sampleRate must be a positive finite number.";
      return std::nullopt;
    }
  }

  if (payload.contains("blockSize")) {
    if (!payload["blockSize"].is_number_integer()) {
      errorMessage = "blockSize must be a positive integer.";
      return std::nullopt;
    }
    options.blockSize = payload["blockSize"].get<int>();
    if (options.blockSize <= 0) {
      errorMessage = "blockSize must be a positive integer.";
      return std::nullopt;
    }
  }

  if (payload.contains("instantiate")) {
    if (!payload["instantiate"].is_boolean()) {
      errorMessage = "instantiate must be a boolean.";
      return std::nullopt;
    }
    options.instantiate = payload["instantiate"].get<bool>();
  }

  options.sampleRate = std::clamp(options.sampleRate, 8000.0, 384000.0);
  options.blockSize = std::clamp(options.blockSize, 16, 8192);
  return options;
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

CommandResult disabledProbeResult(const std::string& format) {
  return makeError(
      "probe_fx_plugin",
      "external_plugin_hosting_disabled",
      externalPluginRecoveryHint(format));
}

}  // namespace

CommandResult handleProbeFxPlugin(const std::string& payloadJson) {
  const auto payload = payloadJson.empty()
      ? nlohmann::json::object()
      : nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.is_object()) {
    return makeError("probe_fx_plugin", "invalid_payload", "Expected object payload.");
  }

  std::string errorMessage;
  const auto options = parseProbeOptions(payload, errorMessage);
  if (!options) {
    return makeError("probe_fx_plugin", "invalid_payload", errorMessage);
  }
  if (!externalPluginFormatEnabled(options->format)) {
    return disabledProbeResult(options->format);
  }

  juce::AudioPluginFormatManager manager;
  juce::addHeadlessDefaultFormatsToManager(manager);
  auto* juceFormat = findJuceFormat(manager, options->format);
  if (juceFormat == nullptr) {
    return makeError(
        "probe_fx_plugin",
        "external_plugin_format_unavailable",
        externalPluginRecoveryHint(options->format));
  }

  juce::OwnedArray<juce::PluginDescription> descriptions;
  juceFormat->findAllTypesForFile(descriptions, juce::String(options->path));
  if (descriptions.isEmpty()) {
    return makeError("probe_fx_plugin", "plugin_description_not_found", "No plugin descriptions found.");
  }

  nlohmann::json descriptionItems = nlohmann::json::array();
  for (const auto* description : descriptions) {
    descriptionItems.push_back(descriptionJson(*description));
  }

  nlohmann::json instanceJson = nlohmann::json::object();
  if (options->instantiate) {
    juce::String juceError;
    auto instance = manager.createPluginInstance(
        *descriptions.getFirst(),
        options->sampleRate,
        options->blockSize,
        juceError);
    if (!instance) {
      return makeError(
          "probe_fx_plugin",
          "plugin_create_failed",
          juceError.isEmpty() ? "Unable to create plugin instance." : juceString(juceError));
    }
    instanceJson = {
        {"name", juceString(instance->getName())},
        {"inputChannels", instance->getTotalNumInputChannels()},
        {"outputChannels", instance->getTotalNumOutputChannels()},
        {"latencySamples", instance->getLatencySamples()},
        {"parameterCount", instance->getParameters().size()},
        {"supportsDoublePrecision", instance->supportsDoublePrecisionProcessing()},
    };
  }

  return makeSuccess(
      "probe_fx_plugin",
      nlohmann::json{
          {"probeVersion", 1},
          {"externalPluginHosting", externalPluginHostingStatus()},
          {"format", options->format},
          {"path", options->path},
          {"descriptionCount", descriptions.size()},
          {"descriptions", descriptionItems},
          {"instantiated", options->instantiate},
          {"instance", instanceJson},
      }.dump());
}

}  // namespace musicapp
