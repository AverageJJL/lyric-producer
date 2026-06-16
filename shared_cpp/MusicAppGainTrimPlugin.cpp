#include "MusicAppGainTrimPlugin.h"

#include <algorithm>
#include <cmath>

namespace musicapp {

namespace te = tracktion::engine;

const char* MusicAppGainTrimPlugin::xmlTypeName = "musicapp_gain_trim";

MusicAppGainTrimPlugin::MusicAppGainTrimPlugin(te::PluginCreationInfo info)
    : te::Plugin(info) {}

MusicAppGainTrimPlugin::~MusicAppGainTrimPlugin() {
  notifyListenersOfDeletion();
}

juce::ValueTree MusicAppGainTrimPlugin::create() {
  return te::createValueTree(te::IDs::PLUGIN, te::IDs::type, xmlTypeName);
}

void MusicAppGainTrimPlugin::initialise(const te::PluginInitialisationInfo& info) {
  sampleRate = info.sampleRate;
}

void MusicAppGainTrimPlugin::deinitialise() {}

void MusicAppGainTrimPlugin::reset() {}

void MusicAppGainTrimPlugin::setGainDb(double gainDb) {
  const auto clamped = static_cast<float>(std::clamp(gainDb, -24.0, 24.0));
  gainDb_.store(clamped);
  gainLinear_.store(juce::Decibels::decibelsToGain(clamped));
  setEnabled(std::abs(clamped) > 0.001f);
}

void MusicAppGainTrimPlugin::applyToBuffer(const te::PluginRenderContext& context) {
  if (!isEnabled() || context.destBuffer == nullptr || context.bufferNumSamples <= 0) {
    return;
  }

  const auto gain = gainLinear_.load();
  for (int channel = 0; channel < context.destBuffer->getNumChannels(); ++channel) {
    auto* dest = context.destBuffer->getWritePointer(channel, context.bufferStartSample);
    for (int sample = 0; sample < context.bufferNumSamples; ++sample) {
      dest[sample] *= gain;
    }
  }
}

bool isManagedGainTrimPlugin(te::Plugin* plugin) {
  return dynamic_cast<MusicAppGainTrimPlugin*>(plugin) != nullptr;
}

}  // namespace musicapp
