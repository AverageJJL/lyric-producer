#pragma once

#include <nlohmann/json.hpp>
#include <optional>
#include <string>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp::playback_device {

nlohmann::json listOutputs(juce::AudioDeviceManager& deviceManager);

bool isHandsFreeOutputProfile(const juce::String& name);
bool isUsablePlaybackOutputName(const juce::String& name);
bool isOutputDeviceAvailable(juce::AudioDeviceManager& deviceManager, const juce::String& outputName);

juce::String pickPreferredPlaybackOutputName(
    juce::AudioDeviceManager& deviceManager,
    const std::string& preferredOutputDeviceName);

void enableOutputOnlyInSetup(juce::AudioDeviceManager::AudioDeviceSetup& setup);
bool isPlaybackDeviceHealthy(juce::AudioIODevice* device);

std::optional<std::string> verifyPlaybackDeviceOpen(
    juce::AudioDeviceManager& deviceManager,
    std::string& preferredOutputDeviceName);

std::optional<std::string> openPlaybackOutputByName(
    juce::AudioDeviceManager& deviceManager,
    const juce::String& targetOutput,
    std::string& preferredOutputDeviceName);

}  // namespace musicapp::playback_device
