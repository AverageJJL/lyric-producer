#pragma once

#include <string>

#include "CommandTypes.h"

namespace musicapp {

std::string commandResultToJson(const CommandResult& result);

CommandResult makeSuccess(const std::string& command, const std::string& dataJson = "{}");
CommandResult makeError(
    const std::string& command,
    const std::string& errorCode,
    const std::string& errorMessage);

}  // namespace musicapp
