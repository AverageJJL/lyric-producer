#include "MusicAppReverbPlugin.h"

#include <algorithm>
#include <cmath>

namespace musicapp {

namespace te = tracktion::engine;

const char* MusicAppReverbPlugin::xmlTypeName = "musicapp_reverb";

MusicAppReverbPlugin::MusicAppReverbPlugin(te::PluginCreationInfo info)
    : te::Plugin(info) {}

MusicAppReverbPlugin::~MusicAppReverbPlugin() {
  notifyListenersOfDeletion();
}

juce::ValueTree MusicAppReverbPlugin::create() {
  return te::createValueTree(te::IDs::PLUGIN, te::IDs::type, xmlTypeName);
}

int MusicAppReverbPlugin::getNumOutputChannelsGivenInputs(int numInputChannels) {
  return juce::jmin(numInputChannels, 2);
}

void MusicAppReverbPlugin::initialise(const te::PluginInitialisationInfo& info) {
  reverb_.setSampleRate(info.sampleRate);
  maxPreDelaySamples_ = std::max(1, static_cast<int>(std::ceil(info.sampleRate * 0.2)) + 1);
  preDelayBuffer_.setSize(2, maxPreDelaySamples_);
  prepareBuffers(info.blockSizeSamples);
  reset();
}

void MusicAppReverbPlugin::deinitialise() {
  wetBuffer_.setSize(0, 0);
  preDelayBuffer_.setSize(0, 0);
  maxPreDelaySamples_ = 1;
  writePosition_ = 0;
}

void MusicAppReverbPlugin::reset() {
  reverb_.reset();
  wetBuffer_.clear();
  preDelayBuffer_.clear();
  writePosition_ = 0;
}

void MusicAppReverbPlugin::setParameters(float size, float mix, float preDelayMs) {
  size_.store(juce::jlimit(0.0f, 1.0f, size));
  mix_.store(juce::jlimit(0.0f, 1.0f, mix));
  preDelayMs_.store(juce::jlimit(0.0f, 200.0f, preDelayMs));
}

void MusicAppReverbPlugin::prepareBuffers(int blockSize) {
  const int safeBlockSize = std::max(1, blockSize);
  if (wetBuffer_.getNumSamples() < safeBlockSize || wetBuffer_.getNumChannels() < 2) {
    wetBuffer_.setSize(2, safeBlockSize, false, false, true);
  }
}

void MusicAppReverbPlugin::applyWetPreDelay(
    int numChannels,
    int numSamples,
    int delaySamples) {
  if (preDelayBuffer_.getNumSamples() <= 0) {
    return;
  }

  const int capacity = preDelayBuffer_.getNumSamples();
  const int clampedDelay = juce::jlimit(0, capacity - 1, delaySamples);

  for (int sample = 0; sample < numSamples; ++sample) {
    int readPosition = writePosition_ - clampedDelay;
    if (readPosition < 0) {
      readPosition += capacity;
    }

    for (int channel = 0; channel < numChannels; ++channel) {
      auto* wet = wetBuffer_.getWritePointer(channel);
      auto* delay = preDelayBuffer_.getWritePointer(channel);
      const float input = wet[sample];
      delay[writePosition_] = input;
      wet[sample] = clampedDelay > 0 ? delay[readPosition] : input;
    }

    writePosition_ = (writePosition_ + 1) % capacity;
  }
}

void MusicAppReverbPlugin::applyToBuffer(const te::PluginRenderContext& context) {
  if (context.destBuffer == nullptr || context.bufferNumSamples <= 0) {
    return;
  }

  const int numChannels = std::min(2, context.destBuffer->getNumChannels());
  if (numChannels <= 0) {
    return;
  }

  prepareBuffers(context.bufferNumSamples);
  for (int channel = 0; channel < numChannels; ++channel) {
    wetBuffer_.copyFrom(
        channel,
        0,
        *context.destBuffer,
        channel,
        context.bufferStartSample,
        context.bufferNumSamples);
  }

  const float size = size_.load();
  const float mix = mix_.load();
  const int delaySamples = static_cast<int>(
      std::round(preDelayMs_.load() * static_cast<float>(sampleRate) / 1000.0f));

  applyWetPreDelay(numChannels, context.bufferNumSamples, delaySamples);

  juce::Reverb::Parameters parameters;
  parameters.roomSize = size;
  parameters.damping = 0.5f;
  parameters.wetLevel = 1.0f;
  parameters.dryLevel = 0.0f;
  parameters.width = 1.0f;
  parameters.freezeMode = 0.0f;
  reverb_.setParameters(parameters);

  if (numChannels == 1) {
    reverb_.processMono(wetBuffer_.getWritePointer(0), context.bufferNumSamples);
  } else {
    reverb_.processStereo(
        wetBuffer_.getWritePointer(0),
        wetBuffer_.getWritePointer(1),
        context.bufferNumSamples);
  }

  const float dryGain = 1.0f - mix;
  for (int channel = 0; channel < numChannels; ++channel) {
    auto* dest = context.destBuffer->getWritePointer(channel, context.bufferStartSample);
    const auto* wet = wetBuffer_.getReadPointer(channel);
    for (int sample = 0; sample < context.bufferNumSamples; ++sample) {
      dest[sample] = (dest[sample] * dryGain) + (wet[sample] * mix);
    }
  }
}

}  // namespace musicapp
