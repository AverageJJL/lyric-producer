#include "PlaybackDeviceSelection.h"

namespace musicapp::playback_device {
namespace {

bool isDisplayOutputDevice(const juce::String& name) {
  const auto lower = name.toLowerCase();
  return lower.contains("nvidia") || lower.contains("hdmi") || lower.contains("display")
         || lower.contains("monitor") || lower.contains("intel(r) display")
         || lower.contains("digital audio");
}

}  // namespace

nlohmann::json listOutputs(juce::AudioDeviceManager& deviceManager) {
  nlohmann::json outputs = nlohmann::json::array();
  for (auto* type : deviceManager.getAvailableDeviceTypes()) {
    if (type == nullptr) {
      continue;
    }

    type->scanForDevices();
    for (const auto& deviceName : type->getDeviceNames(false)) {
      nlohmann::json output;
      output["type"] = type->getTypeName().toStdString();
      output["name"] = deviceName.toStdString();
      outputs.push_back(std::move(output));
    }
  }
  return outputs;
}

bool isHandsFreeOutputProfile(const juce::String& name) {
  const auto lower = name.toLowerCase();
  return lower.contains("hands-free") || lower.contains("hands free")
         || lower.contains("handsfree") || lower.contains("ag audio") || lower.contains("hfp");
}

bool isUsablePlaybackOutputName(const juce::String& name) {
  return name.isNotEmpty() && !isDisplayOutputDevice(name) && !isHandsFreeOutputProfile(name);
}

bool isOutputDeviceAvailable(juce::AudioDeviceManager& deviceManager, const juce::String& outputName) {
  if (outputName.isEmpty()) {
    return false;
  }

  for (auto* type : deviceManager.getAvailableDeviceTypes()) {
    if (type == nullptr) {
      continue;
    }

    type->scanForDevices();
    if (type->getDeviceNames(false).contains(outputName)) {
      return true;
    }
  }
  return false;
}

juce::String pickPreferredPlaybackOutputName(
    juce::AudioDeviceManager& deviceManager,
    const std::string& preferredOutputDeviceName) {
  if (!preferredOutputDeviceName.empty()) {
    const juce::String preferred(preferredOutputDeviceName);
    if (isOutputDeviceAvailable(deviceManager, preferred) && isUsablePlaybackOutputName(preferred)) {
      return preferred;
    }
  }

  for (auto* type : deviceManager.getAvailableDeviceTypes()) {
    if (type == nullptr) {
      continue;
    }

    type->scanForDevices();
    const int defaultIndex = type->getDefaultDeviceIndex(false);
    const auto names = type->getDeviceNames(false);
    if (defaultIndex >= 0 && defaultIndex < names.size() && isUsablePlaybackOutputName(names[defaultIndex])) {
      return names[defaultIndex];
    }
  }

  for (auto* type : deviceManager.getAvailableDeviceTypes()) {
    if (type == nullptr) {
      continue;
    }

    type->scanForDevices();
    for (const auto& name : type->getDeviceNames(false)) {
      if (isUsablePlaybackOutputName(name)) {
        return name;
      }
    }
  }

  return {};
}

void enableOutputOnlyInSetup(juce::AudioDeviceManager::AudioDeviceSetup& setup) {
  setup.inputDeviceName.clear();
  setup.inputChannels.clear();
  setup.useDefaultInputChannels = false;
  setup.useDefaultOutputChannels = true;
  if (setup.outputChannels.countNumberOfSetBits() == 0) {
    setup.outputChannels.setRange(0, 2, true);
  }
}

bool isPlaybackDeviceHealthy(juce::AudioIODevice* device) {
  return device != nullptr && device->isOpen() && !device->getOutputChannelNames().isEmpty();
}

std::optional<std::string> verifyPlaybackDeviceOpen(
    juce::AudioDeviceManager& deviceManager,
    std::string& preferredOutputDeviceName) {
  auto* openedDevice = deviceManager.getCurrentAudioDevice();
  if (!isPlaybackDeviceHealthy(openedDevice)) {
    return std::string("No active audio output device is open.");
  }

  preferredOutputDeviceName = openedDevice->getName().toStdString();
  return std::nullopt;
}

std::optional<std::string> openPlaybackOutputByName(
    juce::AudioDeviceManager& deviceManager,
    const juce::String& targetOutput,
    std::string& preferredOutputDeviceName) {
  if (targetOutput.isEmpty() || !isOutputDeviceAvailable(deviceManager, targetOutput)
      || !isUsablePlaybackOutputName(targetOutput)) {
    return std::string("Output device is not available.");
  }

  for (auto* type : deviceManager.getAvailableDeviceTypes()) {
    if (type == nullptr) {
      continue;
    }

    type->scanForDevices();
    if (type->getDeviceNames(false).contains(targetOutput)) {
      deviceManager.setCurrentAudioDeviceType(type->getTypeName(), false);
      break;
    }
  }

  auto setup = deviceManager.getAudioDeviceSetup();
  enableOutputOnlyInSetup(setup);
  setup.outputDeviceName = targetOutput;

  deviceManager.closeAudioDevice();
  const juce::String error = deviceManager.setAudioDeviceSetup(setup, true);
  if (error.isNotEmpty()) {
    return error.toStdString();
  }

  return verifyPlaybackDeviceOpen(deviceManager, preferredOutputDeviceName);
}

}  // namespace musicapp::playback_device
