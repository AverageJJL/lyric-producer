#include <juce_audio_processors/juce_audio_processors.h>

namespace {

class MusicAppExternalFixtureProcessor final : public juce::AudioProcessor {
public:
  MusicAppExternalFixtureProcessor()
      : juce::AudioProcessor(
            BusesProperties()
                .withInput("Input", juce::AudioChannelSet::stereo(), true)
                .withOutput("Output", juce::AudioChannelSet::stereo(), true)) {}

  const juce::String getName() const override { return "MusicApp External Fixture"; }
  void prepareToPlay(double, int) override {}
  void releaseResources() override {}

  bool isBusesLayoutSupported(const BusesLayout& layouts) const override {
    const auto input = layouts.getMainInputChannelSet();
    const auto output = layouts.getMainOutputChannelSet();
    return !output.isDisabled() && input == output;
  }

  void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&) override {
    buffer.applyGain(0.95f);
  }

  void processBlock(juce::AudioBuffer<double>& buffer, juce::MidiBuffer&) override {
    buffer.applyGain(0.95);
  }

  bool supportsDoublePrecisionProcessing() const override { return true; }
  juce::AudioProcessorEditor* createEditor() override { return nullptr; }
  bool hasEditor() const override { return false; }
  bool acceptsMidi() const override { return false; }
  bool producesMidi() const override { return false; }
  bool isMidiEffect() const override { return false; }
  double getTailLengthSeconds() const override { return 0.0; }
  int getNumPrograms() override { return 1; }
  int getCurrentProgram() override { return 0; }
  void setCurrentProgram(int) override {}
  const juce::String getProgramName(int) override { return {}; }
  void changeProgramName(int, const juce::String&) override {}
  void getStateInformation(juce::MemoryBlock&) override {}
  void setStateInformation(const void*, int) override {}
};

}  // namespace

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() {
  return new MusicAppExternalFixtureProcessor();
}
