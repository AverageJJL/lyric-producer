#include "InputMeterState.h"

#include <algorithm>
#include <cmath>
#include <mutex>

#include <juce_core/juce_core.h>

namespace musicapp {

namespace {
constexpr float kSilentDb = -100.0f;
constexpr float kClipDb = -0.1f;
constexpr uint32_t kHoldMs = 1500;

struct InputMeterState {
  bool active = false;
  std::string deviceName;
  int channelCount = 0;
  float peakDb = kSilentDb;
  float holdDb = kSilentDb;
  bool clipping = false;
  uint32_t holdTimeMs = 0;
  uint32_t updatedAtMs = 0;
};

std::mutex g_inputMeterMutex;
InputMeterState g_inputMeter;

float clampDb(float value) {
  if (!std::isfinite(value)) {
    return kSilentDb;
  }
  return std::clamp(value, kSilentDb, 12.0f);
}

nlohmann::json dbValue(float db) {
  return {
      {"db", db},
      {"linear", db <= kSilentDb ? 0.0f : std::pow(10.0f, db / 20.0f)},
  };
}

}  // namespace

void recordInputMeterPeak(float peak, int channelCount, const std::string& deviceName) {
  const auto now = juce::Time::getApproximateMillisecondCounter();
  const float safePeak = std::max(0.0f, peak);
  const float db = safePeak > 0.0f ? clampDb(20.0f * std::log10(safePeak)) : kSilentDb;

  std::lock_guard<std::mutex> lock(g_inputMeterMutex);
  g_inputMeter.active = true;
  g_inputMeter.deviceName = deviceName;
  g_inputMeter.channelCount = std::max(1, std::min(2, channelCount));
  g_inputMeter.peakDb = db;
  g_inputMeter.clipping = db >= kClipDb;
  g_inputMeter.updatedAtMs = now;
  if (db >= g_inputMeter.holdDb || now - g_inputMeter.holdTimeMs > kHoldMs) {
    g_inputMeter.holdDb = db;
    g_inputMeter.holdTimeMs = now;
  }
}

void markInputMeterInactive(const std::string& deviceName) {
  const auto now = juce::Time::getApproximateMillisecondCounter();
  std::lock_guard<std::mutex> lock(g_inputMeterMutex);
  g_inputMeter.active = false;
  if (!deviceName.empty()) {
    g_inputMeter.deviceName = deviceName;
  }
  g_inputMeter.channelCount = 0;
  g_inputMeter.peakDb = kSilentDb;
  g_inputMeter.holdDb = kSilentDb;
  g_inputMeter.clipping = false;
  g_inputMeter.holdTimeMs = now;
  g_inputMeter.updatedAtMs = now;
}

void resetInputMeterState() {
  std::lock_guard<std::mutex> lock(g_inputMeterMutex);
  g_inputMeter = {};
}

nlohmann::json inputMeterSnapshotJson() {
  std::lock_guard<std::mutex> lock(g_inputMeterMutex);
  nlohmann::json channels = nlohmann::json::array();
  const int channelCount = std::max(0, std::min(2, g_inputMeter.channelCount));
  for (int index = 0; index < channelCount; ++index) {
    channels.push_back({
        {"index", index},
        {"peak", dbValue(g_inputMeter.peakDb)},
    });
  }

  return {
      {"active", g_inputMeter.active},
      {"deviceName", g_inputMeter.deviceName},
      {"peak", dbValue(g_inputMeter.peakDb)},
      {"peakHold", dbValue(g_inputMeter.holdDb)},
      {"clipping", g_inputMeter.clipping},
      {"channels", channels},
      {"updatedAtMs", g_inputMeter.updatedAtMs},
  };
}

}  // namespace musicapp
