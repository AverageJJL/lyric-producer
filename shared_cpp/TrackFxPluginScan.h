#pragma once

#include "CommandTypes.h"

#include <string>

namespace musicapp {

CommandResult handleScanFxPlugins(const std::string& payloadJson);

}  // namespace musicapp
