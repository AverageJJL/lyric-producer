#include "MeterSnapshot.h"

#include "InputMeterState.h"
#include "ProjectState.h"

#include <algorithm>
#include <cmath>
#include <nlohmann/json.hpp>
#include <unordered_set>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

namespace te = tracktion::engine;

namespace {
constexpr float kSilentDb = -100.0f;
constexpr float kClipDb = -0.1f;
constexpr uint32_t kHoldMs = 1500;

float clampDb(float value) {
  if (!std::isfinite(value)) {
    return kSilentDb;
  }
  return std::clamp(value, kSilentDb, 12.0f);
}

te::LevelMeterPlugin* levelMeterForTrack(te::AudioTrack& track) {
  for (auto* plugin : track.pluginList) {
    if (auto* meter = dynamic_cast<te::LevelMeterPlugin*>(plugin)) {
      return meter;
    }
  }
  return nullptr;
}

nlohmann::json dbValue(float db) {
  return {
      {"db", db},
      {"linear", juce::Decibels::decibelsToGain(db)},
  };
}

}  // namespace

class MeterSnapshotReader::MeterTap {
 public:
  ~MeterTap() { attach(nullptr); }

  void attach(te::LevelMeasurer* next) {
    if (measurer_ == next) {
      return;
    }
    if (measurer_ != nullptr) {
      measurer_->removeClient(client_);
    }
    measurer_ = next;
    client_.reset();
    holdDb_ = kSilentDb;
    holdTimeMs_ = 0;
    if (measurer_ != nullptr) {
      measurer_->addClient(client_);
    }
  }

  nlohmann::json read() {
    const int channelCount = std::max(2, std::min(client_.getNumChannelsUsed(), 2));
    float peakDb = kSilentDb;
    bool clipping = false;
    nlohmann::json channels = nlohmann::json::array();

    for (int channel = 0; channel < channelCount; ++channel) {
      const auto level = client_.getAndClearAudioLevel(channel);
      const float db = clampDb(level.dB);
      peakDb = std::max(peakDb, db);
      clipping = clipping || db >= kClipDb;
      channels.push_back({
          {"index", channel},
          {"peak", dbValue(db)},
      });
    }

    const auto now = juce::Time::getApproximateMillisecondCounter();
    if (peakDb >= holdDb_ || now - holdTimeMs_ > kHoldMs) {
      holdDb_ = peakDb;
      holdTimeMs_ = now;
    }

    return {
        {"peak", dbValue(peakDb)},
        {"peakHold", dbValue(holdDb_)},
        {"clipping", clipping},
        {"channels", channels},
    };
  }

 private:
  te::LevelMeasurer* measurer_ = nullptr;
  te::LevelMeasurer::Client client_;
  float holdDb_ = kSilentDb;
  uint32_t holdTimeMs_ = 0;
};

MeterSnapshotReader::MeterSnapshotReader()
    : masterTap_(std::make_unique<MeterTap>()) {}

MeterSnapshotReader::~MeterSnapshotReader() {
  reset();
}

void MeterSnapshotReader::reset() {
  masterTap_->attach(nullptr);
  trackTaps_.clear();
}

std::string MeterSnapshotReader::snapshotJson(te::Edit& edit, const ProjectState& projectState) {
  nlohmann::json payload = {
      {"event", "mixMeterUpdate"},
      {"schemaVersion", 1},
      {"source", "tracktion_level_measurer"},
      {"timestampMs", juce::Time::getApproximateMillisecondCounter()},
      {"tracks", nlohmann::json::array()},
  };

  if (auto* context = edit.getCurrentPlaybackContext()) {
    masterTap_->attach(&context->masterLevels);
  } else {
    masterTap_->attach(nullptr);
  }
  payload["master"] = masterTap_->read();
  payload["input"] = inputMeterSnapshotJson();

  const auto audioTracks = te::getAudioTracks(edit);
  std::unordered_set<std::string> liveIds;
  const auto& uiTracks = projectState.uiTracks();
  for (std::size_t index = 0; index < uiTracks.size(); ++index) {
    const auto& uiTrack = uiTracks[index];
    liveIds.insert(uiTrack.id);
    auto& tap = trackTaps_[uiTrack.id];
    if (!tap) {
      tap = std::make_unique<MeterTap>();
    }

    te::LevelMeterPlugin* meter = nullptr;
    if (index < static_cast<std::size_t>(audioTracks.size()) && audioTracks[static_cast<int>(index)] != nullptr) {
      meter = levelMeterForTrack(*audioTracks[static_cast<int>(index)]);
    }
    tap->attach(meter != nullptr ? &meter->measurer : nullptr);

    auto trackPayload = tap->read();
    trackPayload["trackId"] = uiTrack.id;
    trackPayload["name"] = uiTrack.name;
    trackPayload["muted"] = uiTrack.isMuted;
    trackPayload["solo"] = uiTrack.isSolo;
    payload["tracks"].push_back(std::move(trackPayload));
  }

  for (auto it = trackTaps_.begin(); it != trackTaps_.end();) {
    if (liveIds.find(it->first) == liveIds.end()) {
      it = trackTaps_.erase(it);
    } else {
      ++it;
    }
  }

  return payload.dump();
}

}  // namespace musicapp
