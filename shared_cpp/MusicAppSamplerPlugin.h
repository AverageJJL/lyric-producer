#pragma once

#include <memory>
#include <string>
#include <vector>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

/**
 * Small in-memory sampler for bundled keyboard instruments.
 *
 * Tracktion's built-in sampler rebuilds its playable sample list through
 * AsyncUpdater. This engine serializes native commands on its own worker thread,
 * so the app needs sample loading to finish before assign_track_instrument returns.
 */
class MusicAppSamplerPlugin : public tracktion::engine::Plugin {
 public:
  struct RegionSpec {
    std::string name;
    std::string filePath;
    int rootNote = 60;
    int minNote = 0;
    int maxNote = 127;
    float gainDb = 0.0f;
    double sourceStartSeconds = 0.0;
    double sourceEndSeconds = -1.0;
  };

  struct LoadResult {
    bool ok = true;
    std::string errorCode;
    std::string message;
  };

  explicit MusicAppSamplerPlugin(tracktion::engine::PluginCreationInfo info);
  ~MusicAppSamplerPlugin() override;

  static const char* xmlTypeName;
  static const char* getPluginName() { return "MusicApp Sampler"; }
  static juce::ValueTree create();

  juce::String getName() const override { return getPluginName(); }
  juce::String getPluginType() override { return xmlTypeName; }
  juce::String getShortName(int) override { return "Smpl"; }
  juce::String getSelectableDescription() override { return "MusicApp Sampler Plugin"; }
  bool isSynth() override { return true; }
  bool takesMidiInput() override { return true; }
  bool takesAudioInput() override { return false; }
  bool producesAudioWhenNoAudioInput() override { return true; }
  bool hasNameForMidiNoteNumber(int note, int midiChannel, juce::String& name) override;
  int getNumOutputChannelsGivenInputs(int numInputChannels) override;

  void initialise(const tracktion::engine::PluginInitialisationInfo& info) override;
  void deinitialise() override;
  void reset() override;
  void applyToBuffer(const tracktion::engine::PluginRenderContext& context) override;

  LoadResult setRegions(const std::vector<RegionSpec>& specs);
  int getNumRegions() const;

 private:
  struct RegionData;
  struct Voice;
  struct MidiEvent;

  mutable juce::CriticalSection lock_;
  std::vector<std::shared_ptr<const RegionData>> regions_;
  std::vector<Voice> voices_;

  static LoadResult loadRegion(const RegionSpec& spec, RegionData& region);
  std::shared_ptr<const RegionData> findRegionForNote(int note) const;
  void handleMidiMessage(const juce::MidiMessage& message);
  void renderVoices(juce::AudioBuffer<float>& buffer, int startSample, int numSamples);

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MusicAppSamplerPlugin)
};

}  // namespace musicapp
