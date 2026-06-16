#pragma once

#include <chrono>
#include <functional>
#include <string>

namespace musicapp {

struct CommandResult {
  bool ok = false;
  std::string command;
  std::string dataJson;
  std::string errorCode;
  std::string errorMessage;
};

using CommandHandler = std::function<CommandResult(const std::string& payloadJson)>;
using EngineTask = std::function<void()>;
using EngineTaskPoster = std::function<void(EngineTask task)>;
using EngineDelayedTaskScheduler =
    std::function<void(std::chrono::milliseconds delay, EngineTask task)>;

}  // namespace musicapp
