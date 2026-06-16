#pragma once

#include <nlohmann/json.hpp>
#include <optional>
#include <string>

namespace tracktion {
inline namespace engine {
class Edit;
class Engine;
}  // namespace engine
}  // namespace tracktion

namespace musicapp {

class PlaybackDeviceRouting {
 public:
  const std::string& preferredOutputDeviceName() const;

  nlohmann::json listAudioDeviceOutputs(tracktion::engine::Engine& engine) const;

  std::optional<std::string> refreshAudioDevice(
      tracktion::engine::Engine& engine,
      std::optional<std::string> requestedOutputDeviceName,
      bool useSystemDefault,
      bool forceReopen,
      bool restoreStereoPlayback);

  std::optional<std::string> prepareForAudiblePlayback(
      tracktion::engine::Engine& engine,
      tracktion::engine::Edit& edit);

  void syncWaveDevicesThenRebuild(
      tracktion::engine::Engine& engine,
      tracktion::engine::Edit& edit);

  void rebuildPlaybackGraph(tracktion::engine::Engine& engine, tracktion::engine::Edit& edit);

 private:
  std::optional<std::string> reopenDefaultPlaybackDevice(tracktion::engine::Engine& engine);
  void syncWaveDevices(tracktion::engine::Engine& engine);
  void ensureOutputRouting(tracktion::engine::Engine& engine, tracktion::engine::Edit& edit);

  std::string preferredOutputDeviceName_;
};

}  // namespace musicapp
