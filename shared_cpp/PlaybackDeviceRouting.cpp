#include "PlaybackDeviceRouting.h"

#include "AudioInputCapture.h"
#include "PlaybackDeviceSelection.h"

#include <tracktion_engine/tracktion_engine.h>

namespace te = tracktion::engine;

namespace musicapp {
using namespace playback_device;

const std::string& PlaybackDeviceRouting::preferredOutputDeviceName() const {
  return preferredOutputDeviceName_;
}

nlohmann::json PlaybackDeviceRouting::listAudioDeviceOutputs(te::Engine& engine) const {
  return listOutputs(engine.getDeviceManager().deviceManager);
}

std::optional<std::string> PlaybackDeviceRouting::refreshAudioDevice(
    te::Engine& engine,
    std::optional<std::string> requestedOutputDeviceName,
    bool useSystemDefault,
    bool forceReopen,
    bool restoreStereoPlayback) {
  auto& deviceManager = engine.getDeviceManager().deviceManager;
  auto* currentDevice = deviceManager.getCurrentAudioDevice();

  if (restoreStereoPlayback) {
    forceReopen = true;
  }

  juce::String targetOutput;
  if (useSystemDefault) {
    preferredOutputDeviceName_.clear();
  } else if (requestedOutputDeviceName.has_value()) {
    const juce::String requestedName(requestedOutputDeviceName.value());
    if (!isOutputDeviceAvailable(deviceManager, requestedName) || !isUsablePlaybackOutputName(requestedName)) {
      return "Requested output device is not available.";
    }
    targetOutput = requestedName;
  } else if (!preferredOutputDeviceName_.empty()) {
    const juce::String preferredName(preferredOutputDeviceName_);
    if (isOutputDeviceAvailable(deviceManager, preferredName) && isUsablePlaybackOutputName(preferredName)) {
      targetOutput = preferredName;
    } else {
      preferredOutputDeviceName_.clear();
    }
  }

  if (!restoreStereoPlayback && !forceReopen && currentDevice != nullptr && currentDevice->isOpen()) {
    if (targetOutput.isEmpty() || currentDevice->getName() == targetOutput) {
      if (preferredOutputDeviceName_.empty()) {
        preferredOutputDeviceName_ = currentDevice->getName().toStdString();
      }
      return std::nullopt;
    }
  }

  if (restoreStereoPlayback && currentDevice != nullptr && currentDevice->isOpen()
      && isHandsFreeOutputProfile(currentDevice->getName())) {
    deviceManager.closeAudioDevice();
    currentDevice = nullptr;
  }

  if (useSystemDefault && targetOutput.isEmpty()) {
    targetOutput = pickPreferredPlaybackOutputName(deviceManager, preferredOutputDeviceName_);
  }

  juce::String error;
  if (targetOutput.isEmpty()) {
    if (forceReopen) {
      deviceManager.closeAudioDevice();
    }
    error = deviceManager.initialiseWithDefaultDevices(0, 2);
    if (error.isEmpty()) {
      if (auto* reopenedDevice = deviceManager.getCurrentAudioDevice()) {
        preferredOutputDeviceName_ = reopenedDevice->getName().toStdString();
      }
    }
  } else {
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

    if (forceReopen) {
      deviceManager.closeAudioDevice();
    }
    error = deviceManager.setAudioDeviceSetup(setup, true);
    if (error.isEmpty()) {
      preferredOutputDeviceName_ = targetOutput.toStdString();
    }
  }

  if (error.isNotEmpty()) {
    return error.toStdString();
  }

  auto* openedDevice = deviceManager.getCurrentAudioDevice();
  if (!isPlaybackDeviceHealthy(openedDevice)) {
    const auto fallbackError = deviceManager.initialiseWithDefaultDevices(0, 2);
    if (fallbackError.isNotEmpty()) {
      return fallbackError.toStdString();
    }

    openedDevice = deviceManager.getCurrentAudioDevice();
    if (!isPlaybackDeviceHealthy(openedDevice)) {
      return "No active audio output device is open.";
    }
    preferredOutputDeviceName_ = openedDevice->getName().toStdString();
  }

  if (restoreStereoPlayback && openedDevice != nullptr
      && isHandsFreeOutputProfile(openedDevice->getName())) {
    return "Playback reopened on a hands-free profile; stereo output is unavailable.";
  }

  return std::nullopt;
}

std::optional<std::string> PlaybackDeviceRouting::reopenDefaultPlaybackDevice(te::Engine& engine) {
  auto& deviceManager = engine.getDeviceManager().deviceManager;
  auto* beforeDevice = deviceManager.getCurrentAudioDevice();
  const juce::String micHeldName(getMicCaptureInputDeviceNameForPlaybackConflict());

  if (isPlaybackDeviceHealthy(beforeDevice)) {
    const auto currentName = beforeDevice->getName().toStdString();
    const bool wrongDeviceOpen = !preferredOutputDeviceName_.empty()
                                 && currentName != preferredOutputDeviceName_;
    if (!wrongDeviceOpen) {
      if (preferredOutputDeviceName_.empty()) {
        preferredOutputDeviceName_ = currentName;
      }
      return std::nullopt;
    }
  }

  deviceManager.closeAudioDevice();

  if (!preferredOutputDeviceName_.empty()) {
    const juce::String preferred(preferredOutputDeviceName_);
    if (preferred != micHeldName) {
      if (!openPlaybackOutputByName(deviceManager, preferred, preferredOutputDeviceName_)) {
        return std::nullopt;
      }
    }
  }

  for (const auto& output : listOutputs(deviceManager)) {
    if (!output.is_object() || !output.contains("name")) {
      continue;
    }

    const juce::String candidate(output["name"].get<std::string>());
    if (candidate.isEmpty() || candidate == micHeldName) {
      continue;
    }

    if (!openPlaybackOutputByName(deviceManager, candidate, preferredOutputDeviceName_)) {
      return std::nullopt;
    }
  }

  const juce::String error = deviceManager.initialiseWithDefaultDevices(0, 2);
  if (error.isNotEmpty()) {
    return error.toStdString();
  }

  return verifyPlaybackDeviceOpen(deviceManager, preferredOutputDeviceName_);
}

}  // namespace musicapp
