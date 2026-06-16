#pragma once

#include "CommandTypes.h"

#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <string>

namespace musicapp {

class AudioEngineController;

class EngineEventPublisher {
 public:
  EngineEventPublisher(AudioEngineController& controller, EngineTaskPoster postToEngineThread);
  ~EngineEventPublisher();

  void start();
  void stop();

  void setCallback(std::function<void(const std::string&, const std::string&)> callback);

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace musicapp
