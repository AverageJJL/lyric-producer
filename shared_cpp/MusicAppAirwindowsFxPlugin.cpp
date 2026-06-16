#include "airwin_consolidated_base.h"

#include "MusicAppAirwindowsFxPlugin.h"

#include "MusicAppAirwindowsFactory.h"
#include "fx/AirwindowsFxCatalog.h"
#include "fx/AirwindowsFxParamApply.h"

#include <algorithm>

namespace musicapp {

namespace te = tracktion::engine;

const char* MusicAppAirwindowsFxPlugin::eqXmlTypeName = "musicapp_fx_eq";
const char* MusicAppAirwindowsFxPlugin::compressorXmlTypeName = "musicapp_fx_compressor";
const char* MusicAppAirwindowsFxPlugin::reverbXmlTypeName = "musicapp_fx_reverb";

namespace {

struct SlotBinding {
  const char* slotId;
  const char* xmlType;
  const char* pluginId;
};

const SlotBinding& bindingForType(const juce::String& type) {
  static const SlotBinding kBindings[] = {
      {"eq", MusicAppAirwindowsFxPlugin::eqXmlTypeName, "airwindows:Parametric"},
      {"compressor", MusicAppAirwindowsFxPlugin::compressorXmlTypeName, "airwindows:Logical4"},
      {"reverb", MusicAppAirwindowsFxPlugin::reverbXmlTypeName, "airwindows:MatrixVerb"},
  };
  for (const auto& binding : kBindings) {
    if (type == binding.xmlType) {
      return binding;
    }
  }
  return kBindings[0];
}

juce::ValueTree createTree(const char* xmlType) {
  return te::createValueTree(te::IDs::PLUGIN, te::IDs::type, xmlType);
}

}  // namespace

bool MusicAppAirwindowsFxPlugin::isMusicAppFxType(const juce::String& type) {
  return type == eqXmlTypeName || type == compressorXmlTypeName || type == reverbXmlTypeName;
}

juce::ValueTree MusicAppAirwindowsFxPlugin::createEq() {
  return createTree(eqXmlTypeName);
}

juce::ValueTree MusicAppAirwindowsFxPlugin::createCompressor() {
  return createTree(compressorXmlTypeName);
}

juce::ValueTree MusicAppAirwindowsFxPlugin::createReverb() {
  return createTree(reverbXmlTypeName);
}

MusicAppAirwindowsFxPlugin::MusicAppAirwindowsFxPlugin(te::PluginCreationInfo info)
    : te::Plugin(info) {
  const auto type = info.state[te::IDs::type].toString();
  const auto& binding = bindingForType(type);
  slotId_ = binding.slotId;
  pluginId_ = binding.pluginId;
  xmlType_ = binding.xmlType;
  effect_ = createAirwindowsEffect(pluginId_);
  if (effect_ != nullptr) {
    const auto& spec = airwindowsPluginSpecForSlot(slotId_);
    ensureParamStorage(spec.params.size());
    ensureAutomatableParams(spec);
    setPluginValues(defaultAirwindowsValuesForSlot(slotId_));
  }
}

MusicAppAirwindowsFxPlugin::~MusicAppAirwindowsFxPlugin() {
  notifyListenersOfDeletion();
}

juce::String MusicAppAirwindowsFxPlugin::getName() const {
  return normalizeAirwindowsEffectId(pluginId_);
}

juce::String MusicAppAirwindowsFxPlugin::getShortName(int) {
  if (slotId_ == "eq") {
    return "EQ";
  }
  if (slotId_ == "compressor") {
    return "Comp";
  }
  return "Verb";
}

juce::String MusicAppAirwindowsFxPlugin::getSelectableDescription() {
  return "MusicApp Airwindows " + getName();
}

int MusicAppAirwindowsFxPlugin::getNumOutputChannelsGivenInputs(int numInputChannels) {
  return juce::jmin(numInputChannels, 2);
}

void MusicAppAirwindowsFxPlugin::ensureParamStorage(std::size_t count) {
  if (params_.size() == count) {
    return;
  }
  params_.assign(count, 0.5f);
}

void MusicAppAirwindowsFxPlugin::ensureAutomatableParams(const AirwindowsPluginSpec& spec) {
  if (automatableParams_.size() == spec.params.size()) {
    return;
  }

  automatableParams_.clear();
  automatableParams_.reserve(spec.params.size());
  for (const auto& param : spec.params) {
    automatableParams_.push_back(addParam(param.id, param.label, {0.0f, 1.0f}));
  }
}

void MusicAppAirwindowsFxPlugin::syncParamsToEffect() {
  if (effect_ == nullptr) {
    return;
  }
  for (std::size_t index = 0; index < params_.size(); ++index) {
    if (index < automatableParams_.size() && automatableParams_[index] != nullptr) {
      params_[index] = automatableParams_[index]->getCurrentValue();
    }
    effect_->setParameter(
        static_cast<VstInt32>(index),
        juce::jlimit(0.0f, 1.0f, params_[index]));
  }
}

void MusicAppAirwindowsFxPlugin::initialise(const te::PluginInitialisationInfo& info) {
  if (effect_ != nullptr) {
    effect_->setSampleRate(static_cast<float>(info.sampleRate));
  }
  reset();
}

void MusicAppAirwindowsFxPlugin::deinitialise() {}

void MusicAppAirwindowsFxPlugin::reset() {
  if (effect_ == nullptr) {
    return;
  }
  syncParamsToEffect();
}

void MusicAppAirwindowsFxPlugin::setPluginValues(
    const std::unordered_map<std::string, double>& values) {
  const auto& spec = airwindowsPluginSpecForSlot(slotId_);
  ensureParamStorage(spec.params.size());
  const auto normalized = normalizeAirwindowsValues(pluginId_, values);
  for (std::size_t index = 0; index < spec.params.size(); ++index) {
    const auto value = static_cast<float>(normalized.at(spec.params[index].id));
    params_[index] = value;
    if (index < automatableParams_.size() && automatableParams_[index] != nullptr) {
      automatableParams_[index]->setParameter(value, juce::dontSendNotification);
    }
  }
  syncParamsToEffect();
}

std::unordered_map<std::string, double> MusicAppAirwindowsFxPlugin::pluginValues() {
  if (effect_ == nullptr) {
    return defaultAirwindowsValuesForSlot(slotId_);
  }
  return readAirwindowsValues(*effect_, airwindowsPluginSpecForSlot(slotId_));
}

void MusicAppAirwindowsFxPlugin::applyToBuffer(const te::PluginRenderContext& context) {
  if (!isEnabled() || effect_ == nullptr || context.destBuffer == nullptr
      || context.bufferNumSamples <= 0) {
    return;
  }

  effect_->setSampleRate(static_cast<float>(sampleRate));
  syncParamsToEffect();

  const int numChannels = std::min(2, context.destBuffer->getNumChannels());
  if (numChannels <= 0) {
    return;
  }

  float* channels[2] = {nullptr, nullptr};
  for (int channel = 0; channel < numChannels; ++channel) {
    channels[channel] =
        context.destBuffer->getWritePointer(channel, context.bufferStartSample);
  }

  effect_->processReplacing(channels, channels, context.bufferNumSamples);
}

bool isManagedMusicAppFxPlugin(te::Plugin* plugin) {
  return dynamic_cast<MusicAppAirwindowsFxPlugin*>(plugin) != nullptr;
}

}  // namespace musicapp
