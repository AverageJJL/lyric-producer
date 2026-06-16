#include "FourOscPresets.h"

#include <tracktion_engine/tracktion_engine.h>

namespace te = tracktion::engine;

namespace musicapp {

namespace {

void setParam(te::AutomatableParameter* parameter, float value) {
  if (parameter != nullptr) {
    parameter->setParameter(value, juce::sendNotificationSync);
  }
}

void setOscLevel(te::FourOscPlugin& plugin, int oscIndex, float level) {
  if (oscIndex < plugin.oscParams.size() && plugin.oscParams[oscIndex] != nullptr) {
    setParam(plugin.oscParams[oscIndex]->level.get(), level);
  }
}

void setOscWaveShape(te::FourOscPlugin& plugin, int oscIndex, int waveShape) {
  if (oscIndex < plugin.oscParams.size() && plugin.oscParams[oscIndex] != nullptr) {
    plugin.oscParams[oscIndex]->waveShapeValue = waveShape;
  }
}

}  // namespace

void applyFourOscPreset(te::FourOscPlugin& plugin, const std::string& presetId) {
  if (presetId == "electric_keys") {
    setParam(plugin.ampAttack.get(), 0.015f);
    setParam(plugin.ampDecay.get(), 0.32f);
    setParam(plugin.ampSustain.get(), 0.55f);
    setParam(plugin.ampRelease.get(), 0.42f);
    setParam(plugin.filterFreq.get(), 0.58f);
    setParam(plugin.filterResonance.get(), 0.18f);
    setOscWaveShape(plugin, 0, 2);
    setOscLevel(plugin, 0, 0.62f);
    setOscWaveShape(plugin, 1, 1);
    setOscLevel(plugin, 1, 0.28f);
    return;
  }

  if (presetId == "organ_drawbar") {
    setParam(plugin.ampAttack.get(), 0.001f);
    setParam(plugin.ampDecay.get(), 0.2f);
    setParam(plugin.ampSustain.get(), 0.9f);
    setParam(plugin.ampRelease.get(), 0.16f);
    setParam(plugin.filterFreq.get(), 0.74f);
    setParam(plugin.filterResonance.get(), 0.08f);
    setOscWaveShape(plugin, 0, 1);
    setOscLevel(plugin, 0, 0.7f);
    setOscWaveShape(plugin, 1, 1);
    setOscLevel(plugin, 1, 0.44f);
    return;
  }

  if (presetId == "warm_pad") {
    setParam(plugin.ampAttack.get(), 0.35f);
    setParam(plugin.ampDecay.get(), 0.55f);
    setParam(plugin.ampSustain.get(), 0.85f);
    setParam(plugin.ampRelease.get(), 0.65f);
    setParam(plugin.filterFreq.get(), 0.45f);
    setParam(plugin.filterResonance.get(), 0.25f);
    setOscWaveShape(plugin, 0, 2);
    setOscLevel(plugin, 0, 0.75f);
    setOscLevel(plugin, 1, 0.35f);
    setOscWaveShape(plugin, 1, 1);
    return;
  }

  if (presetId == "string_ensemble") {
    setParam(plugin.ampAttack.get(), 0.42f);
    setParam(plugin.ampDecay.get(), 0.68f);
    setParam(plugin.ampSustain.get(), 0.86f);
    setParam(plugin.ampRelease.get(), 0.72f);
    setParam(plugin.filterFreq.get(), 0.52f);
    setParam(plugin.filterResonance.get(), 0.2f);
    setOscWaveShape(plugin, 0, 2);
    setOscLevel(plugin, 0, 0.7f);
    setOscWaveShape(plugin, 1, 2);
    setOscLevel(plugin, 1, 0.42f);
    return;
  }

  if (presetId == "airy_flute") {
    setParam(plugin.ampAttack.get(), 0.08f);
    setParam(plugin.ampDecay.get(), 0.38f);
    setParam(plugin.ampSustain.get(), 0.68f);
    setParam(plugin.ampRelease.get(), 0.46f);
    setParam(plugin.filterFreq.get(), 0.64f);
    setParam(plugin.filterResonance.get(), 0.12f);
    setOscWaveShape(plugin, 0, 0);
    setOscLevel(plugin, 0, 0.58f);
    setOscWaveShape(plugin, 1, 2);
    setOscLevel(plugin, 1, 0.18f);
    return;
  }

  if (presetId == "brass_stack") {
    setParam(plugin.ampAttack.get(), 0.035f);
    setParam(plugin.ampDecay.get(), 0.3f);
    setParam(plugin.ampSustain.get(), 0.78f);
    setParam(plugin.ampRelease.get(), 0.34f);
    setParam(plugin.filterFreq.get(), 0.69f);
    setParam(plugin.filterResonance.get(), 0.32f);
    setOscWaveShape(plugin, 0, 2);
    setOscLevel(plugin, 0, 0.82f);
    setOscWaveShape(plugin, 1, 1);
    setOscLevel(plugin, 1, 0.34f);
    return;
  }

  if (presetId == "bell_mallet") {
    setParam(plugin.ampAttack.get(), 0.001f);
    setParam(plugin.ampDecay.get(), 0.08f);
    setParam(plugin.ampSustain.get(), 0.15f);
    setParam(plugin.ampRelease.get(), 0.55f);
    setParam(plugin.filterFreq.get(), 0.88f);
    setParam(plugin.filterResonance.get(), 0.28f);
    setOscWaveShape(plugin, 0, 3);
    setOscLevel(plugin, 0, 0.84f);
    setOscWaveShape(plugin, 1, 0);
    setOscLevel(plugin, 1, 0.2f);
    return;
  }

  if (presetId == "pluck_bright") {
    setParam(plugin.ampAttack.get(), 0.001f);
    setParam(plugin.ampDecay.get(), 0.18f);
    setParam(plugin.ampSustain.get(), 0.05f);
    setParam(plugin.ampRelease.get(), 0.22f);
    setParam(plugin.filterFreq.get(), 0.82f);
    setParam(plugin.filterResonance.get(), 0.42f);
    setOscWaveShape(plugin, 0, 3);
    setOscLevel(plugin, 0, 0.9f);
    return;
  }

  if (presetId == "808_sub") {
    setParam(plugin.ampAttack.get(), 0.005f);
    setParam(plugin.ampDecay.get(), 0.45f);
    setParam(plugin.ampSustain.get(), 0.82f);
    setParam(plugin.ampRelease.get(), 0.42f);
    setParam(plugin.filterFreq.get(), 0.18f);
    setParam(plugin.filterResonance.get(), 0.1f);
    setOscWaveShape(plugin, 0, 1);
    setOscLevel(plugin, 0, 1.0f);
    setOscLevel(plugin, 1, 0.08f);
    return;
  }

  if (presetId == "bass_sub") {
    setParam(plugin.ampAttack.get(), 0.01f);
    setParam(plugin.ampDecay.get(), 0.35f);
    setParam(plugin.ampSustain.get(), 0.75f);
    setParam(plugin.ampRelease.get(), 0.28f);
    setParam(plugin.filterFreq.get(), 0.22f);
    setParam(plugin.filterResonance.get(), 0.15f);
    setOscWaveShape(plugin, 0, 1);
    setOscLevel(plugin, 0, 0.95f);
    setOscLevel(plugin, 1, 0.0f);
    return;
  }

  // Default: pop_lead
  setParam(plugin.ampAttack.get(), 0.01f);
  setParam(plugin.ampDecay.get(), 0.28f);
  setParam(plugin.ampSustain.get(), 0.62f);
  setParam(plugin.ampRelease.get(), 0.32f);
  setParam(plugin.filterFreq.get(), 0.72f);
  setParam(plugin.filterResonance.get(), 0.38f);
  setOscWaveShape(plugin, 0, 2);
  setOscLevel(plugin, 0, 0.88f);
  setOscWaveShape(plugin, 1, 1);
  setOscLevel(plugin, 1, 0.25f);
}

}  // namespace musicapp
