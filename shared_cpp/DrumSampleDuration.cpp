#include "DrumSampleDuration.h"
#include "TempoSequenceTime.h"

#include <cstring>

namespace musicapp {

namespace {

uint32_t readLE32(const char* bytes) {
  return static_cast<uint32_t>(static_cast<unsigned char>(bytes[0]))
         | (static_cast<uint32_t>(static_cast<unsigned char>(bytes[1])) << 8)
         | (static_cast<uint32_t>(static_cast<unsigned char>(bytes[2])) << 16)
         | (static_cast<uint32_t>(static_cast<unsigned char>(bytes[3])) << 24);
}

uint16_t readLE16(const char* bytes) {
  return static_cast<uint16_t>(static_cast<unsigned char>(bytes[0]))
         | (static_cast<uint16_t>(static_cast<unsigned char>(bytes[1])) << 8);
}

}  // namespace

bool readWavDurationSeconds(const juce::File& file, double& outSeconds) {
  outSeconds = 0.0;
  if (!file.existsAsFile()) {
    return false;
  }

  juce::FileInputStream stream(file);
  if (!stream.openedOk()) {
    return false;
  }

  char header[44];
  if (stream.read(header, 44) != 44) {
    return false;
  }

  if (std::memcmp(header, "RIFF", 4) != 0 || std::memcmp(header + 8, "WAVE", 4) != 0) {
    return false;
  }

  const uint16_t channels = readLE16(header + 22);
  const uint32_t sampleRate = readLE32(header + 24);
  const uint16_t bitsPerSample = readLE16(header + 34);
  const uint32_t dataSize = readLE32(header + 40);

  if (channels == 0 || sampleRate == 0 || bitsPerSample == 0) {
    return false;
  }

  const double bytesPerSecond =
      static_cast<double>(sampleRate) * static_cast<double>(channels)
      * (static_cast<double>(bitsPerSample) / 8.0);
  if (bytesPerSecond <= 0.0) {
    return false;
  }

  outSeconds = static_cast<double>(dataSize) / bytesPerSecond;
  return outSeconds > 0.0;
}

double drumClipDurationBeats(
    const juce::File& file,
    const tracktion::engine::TempoSequence& tempoSequence) {
  double seconds = 0.0;
  if (!readWavDurationSeconds(file, seconds)) {
    return kMinDrumClipBeats;
  }

  const double beats = secondsToBeatsFromStart(tempoSequence, seconds);
  return beats > kMinDrumClipBeats ? beats : kMinDrumClipBeats;
}

}  // namespace musicapp
