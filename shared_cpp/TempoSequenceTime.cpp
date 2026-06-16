#include "TempoSequenceTime.h"

#include <algorithm>
#include <cmath>
#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

namespace {

constexpr double kFallbackBeatsPerSecond = 2.0;

double nonNegativeOrZero(double value) {
  return std::isfinite(value) && value > 0.0 ? value : 0.0;
}

bool hasTempoEvents(const tracktion::engine::TempoSequence& tempoSequence) {
  return !tempoSequence.getTempos().isEmpty();
}

}  // namespace

double beatAtSeconds(const tracktion::engine::TempoSequence& tempoSequence, double seconds) {
  const double safeSeconds = nonNegativeOrZero(seconds);
  if (!hasTempoEvents(tempoSequence)) {
    return safeSeconds * kFallbackBeatsPerSecond;
  }

  return tempoSequence.toBeats(tracktion::TimePosition::fromSeconds(safeSeconds)).inBeats();
}

double secondsAtBeat(const tracktion::engine::TempoSequence& tempoSequence, double beat) {
  const double safeBeat = nonNegativeOrZero(beat);
  if (!hasTempoEvents(tempoSequence)) {
    return safeBeat / kFallbackBeatsPerSecond;
  }

  return tempoSequence.toTime(tracktion::BeatPosition::fromBeats(safeBeat)).inSeconds();
}

double secondsToBeatsFromStart(
    const tracktion::engine::TempoSequence& tempoSequence,
    double seconds) {
  // Source-file metadata is anchored at beat 0, so Tracktion's absolute time-to-beat
  // conversion gives the same length users see when dropping that file at the start.
  return beatAtSeconds(tempoSequence, seconds);
}

double beatDurationForSecondsAtBeat(
    const tracktion::engine::TempoSequence& tempoSequence,
    double startBeat,
    double seconds) {
  const double safeStartBeat = nonNegativeOrZero(startBeat);
  const double safeSeconds = nonNegativeOrZero(seconds);
  if (safeSeconds <= 0.0) {
    return 0.0;
  }

  const double startSeconds = secondsAtBeat(tempoSequence, safeStartBeat);
  const double endBeat = beatAtSeconds(tempoSequence, startSeconds + safeSeconds);
  return std::max(0.0, endBeat - safeStartBeat);
}

double secondsForBeatDurationAtBeat(
    const tracktion::engine::TempoSequence& tempoSequence,
    double startBeat,
    double lengthBeats) {
  const double safeStartBeat = nonNegativeOrZero(startBeat);
  const double safeLengthBeats = nonNegativeOrZero(lengthBeats);
  if (safeLengthBeats <= 0.0) {
    return 0.0;
  }

  const double startSeconds = secondsAtBeat(tempoSequence, safeStartBeat);
  const double endSeconds = secondsAtBeat(tempoSequence, safeStartBeat + safeLengthBeats);
  return std::max(0.0, endSeconds - startSeconds);
}

}  // namespace musicapp
