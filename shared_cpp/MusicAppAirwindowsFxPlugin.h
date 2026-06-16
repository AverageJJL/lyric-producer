#pragma once

#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <tracktion_engine/tracktion_engine.h>

#include "airwin_consolidated_base.h"

namespace musicapp {

struct AirwindowsPluginSpec;

/** Tracktion insert that runs one pinned Airwindows processor (MIT subset). */
class MusicAppAirwindowsFxPlugin : public tracktion::engine::Plugin {
 public:
  explicit MusicAppAirwindowsFxPlugin(tracktion::engine::PluginCreationInfo info);
  ~MusicAppAirwindowsFxPlugin() override;

  static const char* eqXmlTypeName;
  static const char* compressorXmlTypeName;
  static const char* reverbXmlTypeName;

  static bool isMusicAppFxType(const juce::String& type);
  static juce::ValueTree createEq();
  static juce::ValueTree createCompressor();
  static juce::ValueTree createReverb();

  const std::string& slotId() const { return slotId_; }
  const std::string& pluginId() const { return pluginId_; }

  juce::String getName() const override;
  juce::String getPluginType() override { return xmlType_; }
  juce::String getShortName(int) override;
  juce::String getSelectableDescription() override;
  int getNumOutputChannelsGivenInputs(int numInputChannels) override;

  void initialise(const tracktion::engine::PluginInitialisationInfo& info) override;
  void deinitialise() override;
  void reset() override;
  void applyToBuffer(const tracktion::engine::PluginRenderContext& context) override;

  void setPluginValues(const std::unordered_map<std::string, double>& values);
  std::unordered_map<std::string, double> pluginValues();

 private:
  std::string slotId_;
  std::string pluginId_;
  juce::String xmlType_;
  std::unique_ptr<AirwinConsolidatedBase> effect_;
  std::vector<float> params_;
  std::vector<tracktion::engine::AutomatableParameter::Ptr> automatableParams_;

  void ensureParamStorage(std::size_t count);
  void ensureAutomatableParams(const AirwindowsPluginSpec& spec);
  void syncParamsToEffect();

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MusicAppAirwindowsFxPlugin)
};

bool isManagedMusicAppFxPlugin(tracktion::engine::Plugin* plugin);

}  // namespace musicapp
