#pragma once

#include <string>
#include <unordered_map>

#include "AudioEngineController.h"
#include "CommandTypes.h"

namespace musicapp {

class CommandDispatcher {
 public:
  explicit CommandDispatcher(AudioEngineController& controller);

  CommandResult dispatch(const std::string& command, const std::string& payloadJson);

 private:
  AudioEngineController& controller_;
  std::unordered_map<std::string, CommandHandler> handlers_;

  void registerHandlers();
};

}  // namespace musicapp
