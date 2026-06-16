#include "TransportBeat.h"
#include "TempoSequenceTime.h"

#include <tracktion_engine/tracktion_engine.h>

namespace te = tracktion::engine;

namespace musicapp {

double readTransportBeat(te::Edit& edit) {
  const auto& transport = edit.getTransport();
  return beatAtSeconds(edit.tempoSequence, transport.getPosition().inSeconds());
}

void setTransportPositionBeats(te::Edit& edit, double beat) {
  edit.getTransport().setPosition(
      te::toTime(tracktion::BeatPosition::fromBeats(beat), edit.tempoSequence));
}

}  // namespace musicapp
