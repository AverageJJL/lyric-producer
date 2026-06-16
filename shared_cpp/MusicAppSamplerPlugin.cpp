#include "MusicAppSamplerPlugin.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace musicapp {

namespace te = tracktion::engine;

const char* MusicAppSamplerPlugin::xmlTypeName = "musicapp_sampler";

struct MusicAppSamplerPlugin::RegionData {
  juce::String name;
  juce::AudioBuffer<float> audio;
  double sourceSampleRate = 44100.0;
  int rootNote = 60;
  int minNote = 0;
  int maxNote = 127;
  float gain = 1.0f;
};

struct MusicAppSamplerPlugin::Voice {
  int note = 60;
  std::shared_ptr<const RegionData> region;
  double position = 0.0;
  double step = 1.0;
  float velocity = 1.0f;
  int releaseSamples = -1;
};

struct MusicAppSamplerPlugin::MidiEvent {
  int sample = 0;
  juce::MidiMessage message;
};

MusicAppSamplerPlugin::MusicAppSamplerPlugin(te::PluginCreationInfo info)
    : te::Plugin(info) {}

MusicAppSamplerPlugin::~MusicAppSamplerPlugin() {
  notifyListenersOfDeletion();
}

juce::ValueTree MusicAppSamplerPlugin::create() {
  return te::createValueTree(te::IDs::PLUGIN, te::IDs::type, xmlTypeName);
}

int MusicAppSamplerPlugin::getNumOutputChannelsGivenInputs(int numInputChannels) {
  juce::ignoreUnused(numInputChannels);
  return 2;
}

void MusicAppSamplerPlugin::initialise(const te::PluginInitialisationInfo& info) {
  sampleRate = info.sampleRate;
  reset();
}

void MusicAppSamplerPlugin::deinitialise() {
  const juce::ScopedLock lock(lock_);
  voices_.clear();
}

void MusicAppSamplerPlugin::reset() {
  const juce::ScopedLock lock(lock_);
  voices_.clear();
}

MusicAppSamplerPlugin::LoadResult MusicAppSamplerPlugin::loadRegion(
    const RegionSpec& spec,
    RegionData& region) {
  juce::AudioFormatManager formatManager;
  formatManager.registerBasicFormats();

  const juce::File file(spec.filePath);
  std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(file));
  if (!reader) {
    return {false, "sample_load_failed", spec.filePath};
  }

  if (reader->lengthInSamples <= 0 || reader->lengthInSamples > std::numeric_limits<int>::max()) {
    return {false, "sample_load_failed", spec.filePath};
  }

  const auto sourceLength = reader->lengthInSamples;
  const auto startSample = juce::jlimit<juce::int64>(
      0,
      sourceLength - 1,
      static_cast<juce::int64>(std::floor(std::max(0.0, spec.sourceStartSeconds) * reader->sampleRate)));
  const auto requestedEnd = spec.sourceEndSeconds > spec.sourceStartSeconds
      ? static_cast<juce::int64>(std::ceil(spec.sourceEndSeconds * reader->sampleRate))
      : sourceLength;
  const auto endSample = juce::jlimit<juce::int64>(startSample + 1, sourceLength, requestedEnd);
  const int channels = std::max(1, std::min<int>(2, static_cast<int>(reader->numChannels)));
  const int samples = static_cast<int>(endSample - startSample);
  region.audio.setSize(channels, samples);
  region.audio.clear();
  if (!reader->read(&region.audio, 0, samples, startSample, true, true)) {
    return {false, "sample_load_failed", spec.filePath};
  }

  region.name = spec.name;
  region.sourceSampleRate = reader->sampleRate > 0.0 ? reader->sampleRate : 44100.0;
  region.rootNote = juce::jlimit(0, 127, spec.rootNote);
  region.minNote = juce::jlimit(0, 127, std::min(spec.minNote, spec.maxNote));
  region.maxNote = juce::jlimit(0, 127, std::max(spec.minNote, spec.maxNote));
  region.gain = juce::Decibels::decibelsToGain(spec.gainDb);
  return {};
}

MusicAppSamplerPlugin::LoadResult MusicAppSamplerPlugin::setRegions(
    const std::vector<RegionSpec>& specs) {
  std::vector<std::shared_ptr<const RegionData>> loaded;
  loaded.reserve(specs.size());

  for (const auto& spec : specs) {
    auto region = std::make_shared<RegionData>();
    const auto result = loadRegion(spec, *region);
    if (!result.ok) {
      return result;
    }
    loaded.push_back(std::move(region));
  }

  const juce::ScopedLock lock(lock_);
  regions_ = std::move(loaded);
  voices_.clear();
  return {};
}

int MusicAppSamplerPlugin::getNumRegions() const {
  const juce::ScopedLock lock(lock_);
  return static_cast<int>(regions_.size());
}

std::shared_ptr<const MusicAppSamplerPlugin::RegionData>
MusicAppSamplerPlugin::findRegionForNote(int note) const {
  for (const auto& region : regions_) {
    if (region->minNote <= note && region->maxNote >= note) {
      return region;
    }
  }
  return {};
}

void MusicAppSamplerPlugin::handleMidiMessage(const juce::MidiMessage& message) {
  if (message.isAllNotesOff() || message.isAllSoundOff()) {
    voices_.clear();
    return;
  }

  if (message.isNoteOff()) {
    const int note = message.getNoteNumber();
    for (auto& voice : voices_) {
      if (voice.note == note && voice.releaseSamples < 0) {
        voice.releaseSamples = 16;
      }
    }
    return;
  }

  if (!message.isNoteOn()) {
    return;
  }

  const int note = message.getNoteNumber();
  auto region = findRegionForNote(note);
  if (!region) {
    return;
  }

  Voice voice;
  voice.note = note;
  voice.region = std::move(region);
  voice.velocity = message.getVelocity() / 127.0f;
  const double semitoneRatio = std::pow(2.0, static_cast<double>(note - voice.region->rootNote) / 12.0);
  voice.step = semitoneRatio * (voice.region->sourceSampleRate / std::max(1.0, sampleRate));
  voices_.push_back(std::move(voice));
}

void MusicAppSamplerPlugin::renderVoices(
    juce::AudioBuffer<float>& buffer,
    int startSample,
    int numSamples) {
  if (numSamples <= 0) {
    return;
  }

  const int outChannels = std::min(2, buffer.getNumChannels());
  for (int sample = 0; sample < numSamples; ++sample) {
    for (auto it = voices_.begin(); it != voices_.end();) {
      const auto& region = *it->region;
      const int sourceIndex = static_cast<int>(it->position);
      if (sourceIndex >= region.audio.getNumSamples()) {
        it = voices_.erase(it);
        continue;
      }

      const int nextIndex = std::min(sourceIndex + 1, region.audio.getNumSamples() - 1);
      const float alpha = static_cast<float>(it->position - sourceIndex);
      const float releaseGain = it->releaseSamples >= 0 ? static_cast<float>(it->releaseSamples) / 16.0f : 1.0f;
      const float gain = it->velocity * region.gain * releaseGain;

      for (int channel = 0; channel < outChannels; ++channel) {
        const int sourceChannel = std::min(channel, region.audio.getNumChannels() - 1);
        const float a = region.audio.getSample(sourceChannel, sourceIndex);
        const float b = region.audio.getSample(sourceChannel, nextIndex);
        buffer.addSample(channel, startSample + sample, ((a * (1.0f - alpha)) + (b * alpha)) * gain);
      }

      it->position += it->step;
      if (it->releaseSamples >= 0) {
        it->releaseSamples -= 1;
      }
      if (it->releaseSamples == 0) {
        it = voices_.erase(it);
      } else {
        ++it;
      }
    }
  }
}

void MusicAppSamplerPlugin::applyToBuffer(const te::PluginRenderContext& context) {
  if (context.destBuffer == nullptr || context.bufferNumSamples <= 0) {
    return;
  }

  const juce::ScopedLock lock(lock_);
  context.destBuffer->clear(context.bufferStartSample, context.bufferNumSamples);

  std::vector<MidiEvent> events;
  if (context.bufferForMidiMessages != nullptr) {
    if (context.bufferForMidiMessages->isAllNotesOff) {
      voices_.clear();
    }
    for (const auto& message : *context.bufferForMidiMessages) {
      const int sample = juce::jlimit(
          0,
          context.bufferNumSamples,
          static_cast<int>(std::round(message.getTimeStamp() * sampleRate)));
      events.push_back({sample, message});
    }
    std::sort(events.begin(), events.end(), [](const MidiEvent& lhs, const MidiEvent& rhs) {
      return lhs.sample < rhs.sample;
    });
  }

  int cursor = 0;
  for (const auto& event : events) {
    renderVoices(*context.destBuffer, context.bufferStartSample + cursor, event.sample - cursor);
    handleMidiMessage(event.message);
    cursor = event.sample;
  }
  renderVoices(*context.destBuffer, context.bufferStartSample + cursor, context.bufferNumSamples - cursor);
}

bool MusicAppSamplerPlugin::hasNameForMidiNoteNumber(int note, int midiChannel, juce::String& name) {
  juce::ignoreUnused(midiChannel);
  const juce::ScopedLock lock(lock_);
  for (const auto& region : regions_) {
    if (region->minNote <= note && region->maxNote >= note) {
      name = region->name;
      return true;
    }
  }
  return false;
}

}  // namespace musicapp
