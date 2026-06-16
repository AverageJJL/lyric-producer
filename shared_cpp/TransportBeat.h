#pragma once

namespace tracktion {
inline namespace engine {
class Edit;
}
}  // namespace tracktion

namespace musicapp {

/** Beat position of the main transport — same mapping used for MIDI clip placement. */
double readTransportBeat(tracktion::engine::Edit& edit);

void setTransportPositionBeats(tracktion::engine::Edit& edit, double beat);

}  // namespace musicapp
