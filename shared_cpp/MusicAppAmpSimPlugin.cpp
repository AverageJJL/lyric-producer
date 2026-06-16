#include "MusicAppAmpSimPlugin.h"

#include <algorithm>
#include <cmath>

namespace musicapp {

namespace te = tracktion::engine;

const char* MusicAppAmpSimPlugin::xmlTypeName = "musicapp_amp_sim";

namespace {

float clamp01(double value) {
  return static_cast<float>(juce::jlimit(0.0, 1.0, value));
}

float paramOr(const AmpSimPedalState& pedal, const std::string& key, double fallback) {
  const auto found = pedal.params.find(key);
  return clamp01(found != pedal.params.end() ? found->second : fallback);
}

float saturate(float sample, float drive) {
  const float safeDrive = std::max(1.0f, drive);
  return std::tanh(sample * safeDrive) / std::tanh(safeDrive);
}

}  // namespace

MusicAppAmpSimPlugin::MusicAppAmpSimPlugin(te::PluginCreationInfo info)
    : te::Plugin(info) {}

MusicAppAmpSimPlugin::~MusicAppAmpSimPlugin() {
  notifyListenersOfDeletion();
}

juce::ValueTree MusicAppAmpSimPlugin::create() {
  return te::createValueTree(te::IDs::PLUGIN, te::IDs::type, xmlTypeName);
}

int MusicAppAmpSimPlugin::getNumOutputChannelsGivenInputs(int numInputChannels) {
  return juce::jmin(std::max(1, numInputChannels), 2);
}

void MusicAppAmpSimPlugin::initialise(const te::PluginInitialisationInfo& info) {
  sampleRate = info.sampleRate;
  reset();
}

void MusicAppAmpSimPlugin::deinitialise() {
  reset();
}

void MusicAppAmpSimPlugin::reset() {
  for (auto& channel : cabinetHistory_) {
    channel.fill(0.0f);
  }
  cabinetWritePosition_ = 0;
}

MusicAppAmpSimPlugin::RuntimePedal MusicAppAmpSimPlugin::runtimePedalFor(
    const AmpSimPedalState& pedal) {
  RuntimePedal runtime;
  runtime.enabled = pedal.enabled;

  if (pedal.type == "noise_gate") {
    runtime.kind = PedalKind::noiseGate;
    runtime.values = {paramOr(pedal, "threshold", 0.18), paramOr(pedal, "floor", 0.06), 0.0f, 0.0f};
  } else if (pedal.type == "compressor") {
    runtime.kind = PedalKind::compressor;
    runtime.values = {paramOr(pedal, "threshold", 0.35), paramOr(pedal, "ratio", 0.45), paramOr(pedal, "makeup", 0.5), 0.0f};
  } else if (pedal.type == "overdrive") {
    runtime.kind = PedalKind::overdrive;
    runtime.values = {paramOr(pedal, "drive", 0.35), paramOr(pedal, "tone", 0.55), paramOr(pedal, "level", 0.72), paramOr(pedal, "mix", 1.0)};
  } else if (pedal.type == "eq") {
    runtime.kind = PedalKind::eq;
    runtime.values = {paramOr(pedal, "low", 0.5), paramOr(pedal, "mid", 0.5), paramOr(pedal, "high", 0.5), paramOr(pedal, "level", 0.7)};
  } else {
    runtime.kind = PedalKind::boost;
    runtime.values = {paramOr(pedal, "gain", 0.5), 0.0f, 0.0f, 0.0f};
  }

  return runtime;
}

int MusicAppAmpSimPlugin::cabinetIndexForId(const std::string& irId) {
  if (irId == "guitar_uk_4x12") {
    return 1;
  }
  if (irId == "bass_modern_8x10") {
    return 2;
  }
  if (irId == "bass_vintage_1x15") {
    return 3;
  }
  return 0;
}

const std::array<float, 16>& MusicAppAmpSimPlugin::cabinetKernel(int cabinetIndex) {
  static const std::array<float, 16> kGuitarUs2x12{
      0.45f, 0.26f, 0.13f, 0.04f, -0.02f, -0.04f, -0.02f, 0.01f,
      0.02f, 0.01f, -0.01f, -0.01f, 0.0f, 0.0f, 0.0f, 0.0f};
  static const std::array<float, 16> kGuitarUk4x12{
      0.38f, 0.31f, 0.18f, 0.06f, -0.03f, -0.06f, -0.03f, 0.02f,
      0.04f, 0.02f, -0.02f, -0.01f, 0.0f, 0.0f, 0.0f, 0.0f};
  static const std::array<float, 16> kBass8x10{
      0.55f, 0.29f, 0.12f, 0.04f, 0.02f, -0.01f, -0.02f, -0.01f,
      0.0f, 0.01f, 0.01f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
  static const std::array<float, 16> kBass1x15{
      0.61f, 0.25f, 0.09f, 0.03f, 0.01f, 0.0f, -0.01f, -0.01f,
      0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};

  switch (cabinetIndex) {
    case 1:
      return kGuitarUk4x12;
    case 2:
      return kBass8x10;
    case 3:
      return kBass1x15;
    default:
      return kGuitarUs2x12;
  }
}

void MusicAppAmpSimPlugin::setAmpSimState(const AmpSimState& state) {
  RuntimeState next;
  next.enabled = state.enabled;
  next.cabinetEnabled = state.cabinet.enabled;
  next.cabinetIndex = cabinetIndexForId(state.cabinet.irId);
  next.cabinetMix = clamp01(state.cabinet.mix);

  for (const auto& pedal : state.pedals) {
    if (next.pedalCount >= static_cast<int>(next.pedals.size())) {
      break;
    }
    next.pedals[static_cast<std::size_t>(next.pedalCount)] = runtimePedalFor(pedal);
    next.pedalCount += 1;
  }

  const juce::ScopedLock lock(stateLock_);
  state_ = next;
  setEnabled(state.enabled);
}

float MusicAppAmpSimPlugin::applyPedal(RuntimePedal pedal, float sample) const {
  if (!pedal.enabled) {
    return sample;
  }

  if (pedal.kind == PedalKind::noiseGate) {
    const float threshold = 0.002f + (pedal.values[0] * 0.08f);
    return std::abs(sample) < threshold ? sample * pedal.values[1] : sample;
  }
  if (pedal.kind == PedalKind::compressor) {
    const float threshold = 0.12f + (pedal.values[0] * 0.6f);
    const float ratio = 1.0f + (pedal.values[1] * 7.0f);
    const float makeup = 0.75f + (pedal.values[2] * 0.75f);
    const float magnitude = std::abs(sample);
    if (magnitude <= threshold) {
      return sample * makeup;
    }
    const float compressed = threshold + ((magnitude - threshold) / ratio);
    return std::copysign(compressed * makeup, sample);
  }
  if (pedal.kind == PedalKind::overdrive) {
    const float driven = saturate(sample, 1.0f + (pedal.values[0] * 32.0f));
    const float tone = 0.65f + (pedal.values[1] * 0.7f);
    const float level = 0.35f + (pedal.values[2] * 1.35f);
    const float wet = driven * tone * level;
    return (sample * (1.0f - pedal.values[3])) + (wet * pedal.values[3]);
  }
  if (pedal.kind == PedalKind::eq) {
    const float tilt = 0.85f + ((pedal.values[2] - pedal.values[0]) * 0.45f);
    const float body = 0.85f + (pedal.values[1] * 0.35f);
    const float level = 0.35f + (pedal.values[3] * 1.35f);
    return sample * tilt * body * level;
  }

  return sample * (0.5f + (pedal.values[0] * 1.5f));
}

float MusicAppAmpSimPlugin::applyCabinetSample(int channel, float sample, int cabinetIndex) {
  auto& history = cabinetHistory_[static_cast<std::size_t>(std::min(channel, 1))];
  history[static_cast<std::size_t>(cabinetWritePosition_)] = sample;

  const auto& kernel = cabinetKernel(cabinetIndex);
  float output = 0.0f;
  for (int tap = 0; tap < static_cast<int>(kernel.size()); ++tap) {
    int index = cabinetWritePosition_ - tap;
    if (index < 0) {
      index += static_cast<int>(history.size());
    }
    output += history[static_cast<std::size_t>(index)] * kernel[static_cast<std::size_t>(tap)];
  }
  return output;
}

void MusicAppAmpSimPlugin::applyToBuffer(const te::PluginRenderContext& context) {
  if (!isEnabled() || context.destBuffer == nullptr || context.bufferNumSamples <= 0) {
    return;
  }

  RuntimeState state;
  {
    const juce::ScopedLock lock(stateLock_);
    state = state_;
  }
  if (!state.enabled) {
    return;
  }

  const int numChannels = std::min(2, context.destBuffer->getNumChannels());
  for (int sample = 0; sample < context.bufferNumSamples; ++sample) {
    for (int channel = 0; channel < numChannels; ++channel) {
      auto* dest = context.destBuffer->getWritePointer(channel, context.bufferStartSample);
      float value = dest[sample];
      for (int pedalIndex = 0; pedalIndex < state.pedalCount; ++pedalIndex) {
        value = applyPedal(state.pedals[static_cast<std::size_t>(pedalIndex)], value);
      }
      if (state.cabinetEnabled) {
        const float cabinet = applyCabinetSample(channel, value, state.cabinetIndex);
        value = (value * (1.0f - state.cabinetMix)) + (cabinet * state.cabinetMix);
      }
      dest[sample] = juce::jlimit(-1.25f, 1.25f, value);
    }
    if (state.cabinetEnabled) {
      cabinetWritePosition_ = (cabinetWritePosition_ + 1) % 16;
    }
  }
}

bool isManagedAmpSimPlugin(te::Plugin* plugin) {
  return dynamic_cast<MusicAppAmpSimPlugin*>(plugin) != nullptr;
}

}  // namespace musicapp
