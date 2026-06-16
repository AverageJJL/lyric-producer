#pragma once

#include <atomic>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

/**
 * Native input-gain stage for each channel strip.
 *
 * The UI exposes gain trim separately from the fader, so the engine needs a
 * real pre-fader stage instead of folding both values into Tracktion's volume
 * plugin. Keeping this as a tiny managed insert preserves that DAW contract
 * without asking JavaScript to process or meter audio.
 */
class MusicAppGainTrimPlugin : public tracktion::engine::Plugin {
 public:
  explicit MusicAppGainTrimPlugin(tracktion::engine::PluginCreationInfo info);
  ~MusicAppGainTrimPlugin() override;

  static const char* xmlTypeName;
  static juce::ValueTree create();

  juce::String getName() const override { return "MusicApp Gain Trim"; }
  juce::String getPluginType() override { return xmlTypeName; }
  juce::String getShortName(int) override { return "Trim"; }
  juce::String getSelectableDescription() override { return "MusicApp channel input gain"; }
  int getNumOutputChannelsGivenInputs(int numInputs) override { return juce::jmax(1, numInputs); }

  void initialise(const tracktion::engine::PluginInitialisationInfo& info) override;
  void deinitialise() override;
  void reset() override;
  void applyToBuffer(const tracktion::engine::PluginRenderContext& context) override;

  void setGainDb(double gainDb);
  double gainDb() const { return static_cast<double>(gainDb_.load()); }

 private:
  std::atomic<float> gainDb_{0.0f};
  std::atomic<float> gainLinear_{1.0f};

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MusicAppGainTrimPlugin)
};

bool isManagedGainTrimPlugin(tracktion::engine::Plugin* plugin);

}  // namespace musicapp
