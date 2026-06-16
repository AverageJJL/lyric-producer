#pragma once

#include "CommandTypes.h"

#include <string>

#include <juce_audio_devices/juce_audio_devices.h>
#include <nlohmann/json.hpp>

namespace musicapp {

nlohmann::json listAudioInputDevices();
std::string preferredAudioInputDeviceName();
std::string currentAudioInputDeviceName();
std::string lastMicInputDeviceName();
CommandResult handleSetAudioInputDevice(const std::string& payloadJson);

juce::AudioDeviceManager& micCaptureDeviceManager();
bool openMicCaptureDevice(juce::AudioIODeviceCallback& callback);
void closeMicCaptureDevice(juce::AudioIODeviceCallback& callback, bool resetManager);
double currentMicInputLatencyMs();

}  // namespace musicapp
