#pragma once

#include "CommandTypes.h"

#include <string>

namespace musicapp {

CommandResult handlePrepareAudioFileForPlayback(const std::string& payloadJson);

}  // namespace musicapp
