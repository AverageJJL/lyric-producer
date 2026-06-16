#include "CommandDispatcher.h"

#include "JsonResponse.h"

#include <nlohmann/json.hpp>

namespace musicapp {

CommandDispatcher::CommandDispatcher(AudioEngineController& controller) : controller_(controller) {
  registerHandlers();
}

CommandResult CommandDispatcher::dispatch(const std::string& command, const std::string& payloadJson) {
  const auto it = handlers_.find(command);
  if (it == handlers_.end()) {
    const auto response = controller_.dispatchCommand(command, payloadJson);
    nlohmann::json parsed = nlohmann::json::parse(response, nullptr, false);
    if (!parsed.is_discarded() && parsed.contains("ok")) {
      return CommandResult{
          parsed.value("ok", false),
          command,
          parsed.contains("data") ? parsed["data"].dump() : "{}",
          parsed.contains("error") ? parsed["error"].value("code", std::string{}) : std::string{},
          parsed.contains("error") ? parsed["error"].value("message", std::string{}) : std::string{},
      };
    }

    return makeError(command, "unknown_command", "No handler registered for command.");
  }

  return it->second(payloadJson);
}

void CommandDispatcher::registerHandlers() {
  handlers_["engine_init"] = [this](const std::string&) {
    const auto response = controller_.initialize();
    nlohmann::json parsed = nlohmann::json::parse(response, nullptr, false);
    return CommandResult{
        parsed.value("ok", false),
        "engine_init",
        parsed.contains("data") ? parsed["data"].dump() : "{}",
        parsed.contains("error") ? parsed["error"].value("code", std::string{}) : std::string{},
        parsed.contains("error") ? parsed["error"].value("message", std::string{}) : std::string{},
    };
  };

  handlers_["engine_shutdown"] = [this](const std::string&) {
    const auto response = controller_.shutdown();
    nlohmann::json parsed = nlohmann::json::parse(response, nullptr, false);
    return CommandResult{
        parsed.value("ok", false),
        "engine_shutdown",
        parsed.contains("data") ? parsed["data"].dump() : "{}",
        parsed.contains("error") ? parsed["error"].value("code", std::string{}) : std::string{},
        parsed.contains("error") ? parsed["error"].value("message", std::string{}) : std::string{},
    };
  };
}

}  // namespace musicapp
