#pragma once

#include <functional>
#include <memory>
#include <string>

namespace musicapp {

struct EngineTransportSnapshot {
  bool isPlaying = false;
  double positionSeconds = 0.0;
  /** Timeline beat from the engine tempo map (matches MIDI clip scheduling). */
  double positionBeat = 0.0;
  double bpm = 120.0;
  bool clickTrackEnabled = true;
};

using EngineEventCallback = std::function<void(const std::string& eventName, const std::string& payloadJson)>;

class AudioEngineController {
 public:
  AudioEngineController();
  ~AudioEngineController();

  AudioEngineController(const AudioEngineController&) = delete;
  AudioEngineController& operator=(const AudioEngineController&) = delete;

  std::string initialize();
  std::string shutdown();
  std::string getStatusJson() const;
  std::string getTransportStatusJson() const;
  std::string getMeterSnapshotJson() const;
  std::string dispatchCommand(const std::string& command, const std::string& payloadJson);

  void setEventCallback(EngineEventCallback callback);

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace musicapp
