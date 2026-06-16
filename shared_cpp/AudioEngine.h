#pragma once

#include <memory>
#include <string>

#include "AudioEngineController.h"

namespace musicapp {

class CommandDispatcher;

class AudioEngine {
 public:
  AudioEngine();
  ~AudioEngine();

  std::string processCommand(std::string command, std::string payload);
  void setEventCallback(EngineEventCallback callback);

 private:
  std::unique_ptr<AudioEngineController> controller_;
  std::unique_ptr<CommandDispatcher> dispatcher_;
  bool autoInitialized_ = false;

  void ensureInitialized();
};

}  // namespace musicapp
