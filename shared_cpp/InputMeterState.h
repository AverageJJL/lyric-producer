#pragma once

#include <nlohmann/json.hpp>

#include <string>

namespace musicapp {

void recordInputMeterPeak(float peak, int channelCount, const std::string& deviceName);
void markInputMeterInactive(const std::string& deviceName = {});
void resetInputMeterState();
nlohmann::json inputMeterSnapshotJson();

}  // namespace musicapp
