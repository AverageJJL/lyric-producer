#pragma once

#include "CommandTypes.h"

#include <string>

namespace tracktion {
inline namespace engine {
class Edit;
}
}

namespace musicapp {

CommandResult handleSetTempoMap(tracktion::engine::Edit& edit, const std::string& payloadJson);
CommandResult handleGetTempoMap(tracktion::engine::Edit& edit);

}  // namespace musicapp
