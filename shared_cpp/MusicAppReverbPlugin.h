#pragma once

#include <atomic>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

class MusicAppReverbPlugin : public tracktion::engine::Plugin {
 public:
  explicit MusicAppReverbPlugin(tracktion::engine::PluginCreationInfo info);
  ~MusicAppReverbPlugin() override;

  static const char* xmlTypeName;
  static const char* getPluginName() { return "MusicApp Reverb"; }
  static juce::ValueTree create();

  juce::String getName() const override { return getPluginName(); }
  juce::String getPluginType() override { return xmlTypeName; }
  juce::String getShortName(int) override { return "Verb"; }
  juce::String getSelectableDescription() override { return "MusicApp Reverb Plugin"; }
  int getNumOutputChannelsGivenInputs(int numInputChannels) override;

  void initialise(const tracktion::engine::PluginInitialisationInfo& info) override;
  void deinitialise() override;
  void reset() override;
  void applyToBuffer(const tracktion::engine::PluginRenderContext& context) override;

  void setParameters(float size, float mix, float preDelayMs);
  float getSize() const { return size_.load(); }
  float getMix() const { return mix_.load(); }
  float getPreDelayMs() const { return preDelayMs_.load(); }

 private:
  std::atomic<float> size_{0.5f};
  std::atomic<float> mix_{0.2f};
  std::atomic<float> preDelayMs_{20.0f};
  juce::Reverb reverb_;
  juce::AudioBuffer<float> wetBuffer_;
  juce::AudioBuffer<float> preDelayBuffer_;
  int maxPreDelaySamples_ = 1;
  int writePosition_ = 0;

  void prepareBuffers(int blockSize);
  void applyWetPreDelay(int numChannels, int numSamples, int delaySamples);

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MusicAppReverbPlugin)
};

}  // namespace musicapp
