#pragma once

#include "ProjectState.h"

#include <array>
#include <atomic>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

/**
 * Low-latency DI amp-sim insert driven by JSON state.
 *
 * The app cannot process audio in JavaScript, so the pedalboard and cabinet
 * response live as a native Tracktion plugin. Cabinet "IRs" are small built-in
 * FIR kernels selected by id; that keeps the first command surface deterministic
 * while leaving room for external IR loading later.
 */
class MusicAppAmpSimPlugin : public tracktion::engine::Plugin {
 public:
  explicit MusicAppAmpSimPlugin(tracktion::engine::PluginCreationInfo info);
  ~MusicAppAmpSimPlugin() override;

  static const char* xmlTypeName;
  static const char* getPluginName() { return "MusicApp Amp Sim"; }
  static juce::ValueTree create();

  juce::String getName() const override { return getPluginName(); }
  juce::String getPluginType() override { return xmlTypeName; }
  juce::String getShortName(int) override { return "Amp"; }
  juce::String getSelectableDescription() override { return "MusicApp DI Amp Sim"; }
  bool takesAudioInput() override { return true; }
  int getNumOutputChannelsGivenInputs(int numInputChannels) override;

  void initialise(const tracktion::engine::PluginInitialisationInfo& info) override;
  void deinitialise() override;
  void reset() override;
  void applyToBuffer(const tracktion::engine::PluginRenderContext& context) override;

  void setAmpSimState(const AmpSimState& state);

 private:
  enum class PedalKind { noiseGate, compressor, overdrive, eq, boost };

  struct RuntimePedal {
    PedalKind kind = PedalKind::boost;
    bool enabled = true;
    std::array<float, 4> values{0.5f, 0.5f, 0.5f, 0.5f};
  };

  struct RuntimeState {
    bool enabled = false;
    int pedalCount = 0;
    std::array<RuntimePedal, 8> pedals{};
    bool cabinetEnabled = true;
    int cabinetIndex = 0;
    float cabinetMix = 1.0f;
  };

  juce::CriticalSection stateLock_;
  RuntimeState state_;
  std::array<std::array<float, 16>, 2> cabinetHistory_{};
  int cabinetWritePosition_ = 0;

  static RuntimePedal runtimePedalFor(const AmpSimPedalState& pedal);
  static int cabinetIndexForId(const std::string& irId);
  static const std::array<float, 16>& cabinetKernel(int cabinetIndex);

  float applyPedal(RuntimePedal pedal, float sample) const;
  float applyCabinetSample(int channel, float sample, int cabinetIndex);

  JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MusicAppAmpSimPlugin)
};

bool isManagedAmpSimPlugin(tracktion::engine::Plugin* plugin);

}  // namespace musicapp
