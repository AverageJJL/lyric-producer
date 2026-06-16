#pragma once

namespace tracktion {
inline namespace engine {
class TempoSequence;
}
}  // namespace tracktion

namespace musicapp {

double beatAtSeconds(const tracktion::engine::TempoSequence& tempoSequence, double seconds);
double secondsAtBeat(const tracktion::engine::TempoSequence& tempoSequence, double beat);
double secondsToBeatsFromStart(
    const tracktion::engine::TempoSequence& tempoSequence,
    double seconds);
double beatDurationForSecondsAtBeat(
    const tracktion::engine::TempoSequence& tempoSequence,
    double startBeat,
    double seconds);
double secondsForBeatDurationAtBeat(
    const tracktion::engine::TempoSequence& tempoSequence,
    double startBeat,
    double lengthBeats);

}  // namespace musicapp
