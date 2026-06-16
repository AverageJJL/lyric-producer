#pragma once

#include "CommandTypes.h"

#include <string>

namespace musicapp {

CommandResult handleProbeFxPlugin(const std::string& payloadJson);

}  // namespace musicapp
