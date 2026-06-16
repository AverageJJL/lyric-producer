#include "JsonResponse.h"

#include <nlohmann/json.hpp>

namespace musicapp {

std::string commandResultToJson(const CommandResult& result) {
  nlohmann::json payload;
  payload["ok"] = result.ok;
  payload["command"] = result.command;

  if (!result.dataJson.empty()) {
    payload["data"] = nlohmann::json::parse(result.dataJson, nullptr, false);
    if (payload["data"].is_discarded()) {
      payload["data"] = nlohmann::json::object();
    }
  }

  if (!result.ok) {
    payload["error"] = {
        {"code", result.errorCode},
        {"message", result.errorMessage},
    };
  }

  return payload.dump();
}

CommandResult makeSuccess(const std::string& command, const std::string& dataJson) {
  return CommandResult{true, command, dataJson, {}, {}};
}

CommandResult makeError(
    const std::string& command,
    const std::string& errorCode,
    const std::string& errorMessage) {
  return CommandResult{false, command, {}, errorCode, errorMessage};
}

}  // namespace musicapp
