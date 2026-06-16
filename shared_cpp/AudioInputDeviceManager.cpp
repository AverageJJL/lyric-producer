#include "AudioInputDeviceManager.h"

#include "InputMeterState.h"
#include "JsonResponse.h"

#include <algorithm>

namespace musicapp {

namespace {

juce::String g_lastMicInputDeviceName;
juce::String g_preferredMicInputDeviceName;

// Mic capture has its own manager so Tracktion playback does not reopen or
// retune the output device when voice capture starts.
std::unique_ptr<juce::AudioDeviceManager> g_micCaptureManager;
bool g_micCaptureManagerInitialized = false;

double latencyMsForSamples(int samples, double sampleRate) {
  return sampleRate > 0.0 ? (static_cast<double>(samples) * 1000.0) / sampleRate : 0.0;
}

void ensureMicCaptureManagerInitialized() {
  if (g_micCaptureManagerInitialized) {
    return;
  }
  auto& dm = micCaptureDeviceManager();
  dm.initialise(0, 0, nullptr, true);
  g_micCaptureManagerInitialized = true;
}

nlohmann::json listInputs(juce::AudioDeviceManager& deviceManager) {
  nlohmann::json inputs = nlohmann::json::array();
  for (auto* type : deviceManager.getAvailableDeviceTypes()) {
    if (type == nullptr) {
      continue;
    }
    type->scanForDevices();
    for (const auto& deviceName : type->getDeviceNames(true)) {
      inputs.push_back({
          {"type", type->getTypeName().toStdString()},
          {"name", deviceName.toStdString()},
      });
    }
  }
  return inputs;
}

bool deviceHasActiveInput(juce::AudioIODevice* device) {
  return device != nullptr && device->isOpen()
         && device->getActiveInputChannels().countNumberOfSetBits() > 0;
}

bool isInputDeviceAvailable(juce::AudioDeviceManager& deviceManager, const juce::String& inputName) {
  if (inputName.isEmpty()) {
    return true;
  }
  for (auto* type : deviceManager.getAvailableDeviceTypes()) {
    if (type == nullptr) {
      continue;
    }
    type->scanForDevices();
    if (type->getDeviceNames(true).contains(inputName)) {
      return true;
    }
  }
  return false;
}

bool isHandsFreeInputProfile(const juce::String& name) {
  const auto lower = name.toLowerCase();
  return lower.contains("hands-free") || lower.contains("hands free")
         || lower.contains("handsfree") || lower.contains("ag audio") || lower.contains("hfp");
}

bool isDisplayOrHdmiInput(const juce::String& name) {
  const auto lower = name.toLowerCase();
  return lower.contains("nvidia") || lower.contains("hdmi") || lower.contains("display")
         || lower.contains("monitor") || lower.contains("27e3q");
}

bool looksLikeMicrophoneName(const juce::String& name) {
  const auto lower = name.toLowerCase();
  if (lower.contains("microphone") || lower.contains("mic (") || lower.contains("mic(")
      || (lower.contains("headset") && lower.contains("mic"))
      || (lower.contains("headphone") && lower.contains("mic"))) {
    return true;
  }
  return !isDisplayOrHdmiInput(name) && !isHandsFreeInputProfile(name) && lower.contains("mic");
}

juce::String findMicrophoneInputName(juce::AudioDeviceManager& deviceManager) {
  juce::String handsFreeFallback;
  auto considerInput = [&](const juce::String& name) {
    if (name.isEmpty() || isDisplayOrHdmiInput(name)) {
      return false;
    }
    if (isHandsFreeInputProfile(name)) {
      handsFreeFallback = handsFreeFallback.isEmpty() ? name : handsFreeFallback;
      return false;
    }
    return looksLikeMicrophoneName(name);
  };

  const juce::String currentType = deviceManager.getCurrentAudioDeviceType();
  for (auto* type : deviceManager.getAvailableDeviceTypes()) {
    if (type == nullptr) {
      continue;
    }
    type->scanForDevices();
    if (currentType.isNotEmpty() && type->getTypeName() != currentType) {
      continue;
    }
    for (const auto& name : type->getDeviceNames(true)) {
      if (considerInput(name)) {
        return name;
      }
    }
  }

  for (auto* type : deviceManager.getAvailableDeviceTypes()) {
    if (type == nullptr) {
      continue;
    }
    type->scanForDevices();
    const auto inputNames = type->getDeviceNames(true);
    const int defaultIndex = type->getDefaultDeviceIndex(true);
    if (defaultIndex >= 0 && defaultIndex < inputNames.size() && considerInput(inputNames[defaultIndex])) {
      return inputNames[defaultIndex];
    }
    for (const auto& name : inputNames) {
      if (considerInput(name)) {
        return name;
      }
    }
  }
  return handsFreeFallback;
}

void enableInputOnlyInSetup(juce::AudioDeviceManager::AudioDeviceSetup& setup) {
  setup.outputDeviceName.clear();
  setup.outputChannels.clear();
  setup.useDefaultOutputChannels = false;
  setup.useDefaultInputChannels = true;
  if (setup.inputChannels.countNumberOfSetBits() == 0) {
    setup.inputChannels.setRange(0, 2, true);
  }
}

bool openInputDeviceByName(juce::AudioDeviceManager& dm, const juce::String& inputName) {
  if (inputName.isEmpty()) {
    return false;
  }
  for (auto* type : dm.getAvailableDeviceTypes()) {
    if (type != nullptr && type->getDeviceNames(true).contains(inputName)) {
      dm.setCurrentAudioDeviceType(type->getTypeName(), true);
      break;
    }
  }

  auto setup = dm.getAudioDeviceSetup();
  enableInputOnlyInSetup(setup);
  setup.inputDeviceName = inputName;
  const juce::String error = dm.setAudioDeviceSetup(setup, true);
  if (error.isEmpty() && deviceHasActiveInput(dm.getCurrentAudioDevice())) {
    g_lastMicInputDeviceName = dm.getAudioDeviceSetup().inputDeviceName;
    markInputMeterInactive(g_lastMicInputDeviceName.toStdString());
    return true;
  }
  dm.closeAudioDevice();
  return false;
}

}  // namespace

juce::AudioDeviceManager& micCaptureDeviceManager() {
  if (g_micCaptureManager == nullptr) {
    g_micCaptureManager = std::make_unique<juce::AudioDeviceManager>();
  }
  return *g_micCaptureManager;
}

nlohmann::json listAudioInputDevices() {
  ensureMicCaptureManagerInitialized();
  return listInputs(micCaptureDeviceManager());
}

std::string preferredAudioInputDeviceName() {
  return g_preferredMicInputDeviceName.toStdString();
}

std::string currentAudioInputDeviceName() {
  if (g_micCaptureManager != nullptr) {
    const auto setup = g_micCaptureManager->getAudioDeviceSetup();
    if (setup.inputDeviceName.isNotEmpty()) {
      return setup.inputDeviceName.toStdString();
    }
  }
  return lastMicInputDeviceName();
}

std::string lastMicInputDeviceName() {
  return g_lastMicInputDeviceName.toStdString();
}

CommandResult handleSetAudioInputDevice(const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("name") || !payload["name"].is_string()) {
    return makeError("set_input_device", "invalid_payload", "Expected payload { \"name\": string }.");
  }

  ensureMicCaptureManagerInitialized();
  const juce::String requestedName(payload["name"].get<std::string>());
  if (requestedName.isNotEmpty()
      && !isInputDeviceAvailable(micCaptureDeviceManager(), requestedName)) {
    return makeError("set_input_device", "input_unavailable", "Input device is not available.");
  }

  g_preferredMicInputDeviceName = requestedName;
  nlohmann::json data;
  data["inputs"] = listAudioInputDevices();
  data["preferredInputDeviceName"] = preferredAudioInputDeviceName();
  data["currentInputDeviceName"] = currentAudioInputDeviceName();
  return makeSuccess("set_input_device", data.dump());
}

bool openMicCaptureDevice(juce::AudioIODeviceCallback& callback) {
  ensureMicCaptureManagerInitialized();
  auto& dm = micCaptureDeviceManager();
  dm.removeAudioCallback(&callback);
  dm.closeAudioDevice();

  if (g_preferredMicInputDeviceName.isNotEmpty()
      && openInputDeviceByName(dm, g_preferredMicInputDeviceName)) {
    return true;
  }

  const juce::String dedicatedMic = findMicrophoneInputName(dm);
  if (dedicatedMic.isNotEmpty() && openInputDeviceByName(dm, dedicatedMic)) {
    return true;
  }

  const juce::String error = dm.initialiseWithDefaultDevices(2, 0);
  if (error.isNotEmpty()) {
    g_lastMicInputDeviceName.clear();
    markInputMeterInactive();
    return false;
  }

  g_lastMicInputDeviceName = dm.getAudioDeviceSetup().inputDeviceName;
  markInputMeterInactive(g_lastMicInputDeviceName.toStdString());
  return deviceHasActiveInput(dm.getCurrentAudioDevice());
}

void closeMicCaptureDevice(juce::AudioIODeviceCallback& callback, bool resetManager) {
  if (g_micCaptureManager != nullptr) {
    g_micCaptureManager->removeAudioCallback(&callback);
    g_micCaptureManager->closeAudioDevice();
  }
  g_lastMicInputDeviceName.clear();
  markInputMeterInactive();
  if (resetManager) {
    g_micCaptureManager.reset();
    g_micCaptureManagerInitialized = false;
  }
}

double currentMicInputLatencyMs() {
  auto* device = g_micCaptureManager != nullptr ? g_micCaptureManager->getCurrentAudioDevice() : nullptr;
  return device == nullptr ? 0.0 : latencyMsForSamples(device->getInputLatencyInSamples(), device->getCurrentSampleRate());
}

}  // namespace musicapp
