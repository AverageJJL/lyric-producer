#include "ArrangementCommands.h"
#include "InstrumentCommands.h"
#include "MusicAppAirwindowsFxPlugin.h"
#include "MusicAppGainTrimPlugin.h"
#include "SamplerInstrumentCommands.h"
#include "TrackAutomation.h"

#include <algorithm>
#include <string>

namespace te = tracktion::engine;

namespace musicapp {

namespace {

constexpr float kFourOscFilterFreqRange = 135.076232f;
constexpr float kFourOscFilterResonanceRange = 100.0f;

MusicAppGainTrimPlugin* findGainTrimPlugin(te::AudioTrack& track) {
  for (auto* plugin : track.pluginList) {
    if (auto* gainTrim = dynamic_cast<MusicAppGainTrimPlugin*>(plugin)) {
      return gainTrim;
    }
  }
  return nullptr;
}

void clearExtraGainTrimPlugins(te::AudioTrack& track, MusicAppGainTrimPlugin* keep) {
  const auto plugins = track.pluginList.getPlugins();
  for (auto* plugin : plugins) {
    if (plugin != nullptr && plugin != keep && isManagedGainTrimPlugin(plugin)) {
      plugin->deleteFromParent();
    }
  }
}

int gainTrimInsertIndex(te::AudioTrack& track) {
  for (int index = 0; index < track.pluginList.size(); ++index) {
    auto* plugin = track.pluginList[index];
    if (dynamic_cast<te::FourOscPlugin*>(plugin) != nullptr
        || isSamplerInstrumentPlugin(plugin)) {
      return index + 1;
    }
  }
  return 0;
}

MusicAppGainTrimPlugin* ensureGainTrimPlugin(te::Edit& edit, te::AudioTrack& track) {
  if (auto* existing = findGainTrimPlugin(track)) {
    clearExtraGainTrimPlugins(track, existing);
    return existing;
  }

  auto plugin = edit.getPluginCache().createNewPlugin(MusicAppGainTrimPlugin::create());
  auto* gainTrim = dynamic_cast<MusicAppGainTrimPlugin*>(plugin.get());
  if (gainTrim == nullptr) {
    return nullptr;
  }

  track.pluginList.insertPlugin(plugin, gainTrimInsertIndex(track), nullptr);
  return gainTrim;
}

float tracktionAutomationCurveValue(
    const std::string& parameterId,
    double uiValue) {
  if (parameterId == "volumeDb") {
    return te::decibelsToVolumeFaderPosition(
        static_cast<float>(std::clamp(uiValue, -60.0, 6.0)));
  }
  return static_cast<float>(std::clamp(uiValue, -1.0, 1.0));
}

void syncTracktionAutomationCurve(
    te::AutomatableParameter* parameter,
    const UiTrackAutomationLane* lane,
    const std::string& parameterId,
    bool readEnabled) {
  if (parameter == nullptr) {
    return;
  }

  auto& curve = parameter->getCurve();
  curve.clear(nullptr);
  curve.bypass = !readEnabled;
  if (lane == nullptr || lane->points.empty()) {
    return;
  }

  for (const auto& point : lane->points) {
    curve.addPoint(
        te::EditPosition(tracktion::BeatPosition::fromBeats(std::max(0.0, point.beat))),
        tracktionAutomationCurveValue(parameterId, point.value),
        0.0f,
        nullptr);
  }
}

void syncNormalisedAutomationCurve(
    te::AutomatableParameter* parameter,
    const UiTrackAutomationLane* lane,
    bool readEnabled) {
  if (parameter == nullptr) {
    return;
  }

  auto& curve = parameter->getCurve();
  curve.clear(nullptr);
  curve.bypass = !readEnabled;
  if (lane == nullptr || lane->points.empty()) {
    return;
  }

  for (const auto& point : lane->points) {
    curve.addPoint(
        te::EditPosition(tracktion::BeatPosition::fromBeats(std::max(0.0, point.beat))),
        static_cast<float>(std::clamp(point.value, 0.0, 1.0)),
        0.0f,
        nullptr);
  }
}

float instrumentAutomationCurveValue(
    const std::string& parameterId,
    double uiValue) {
  if (parameterId == "filter.cutoff") {
    // The UI stores synth cutoff as a normalized producer control, while
    // Tracktion's FourOsc automation curve expects the plugin's frequency range.
    return static_cast<float>(std::clamp(uiValue, 0.0, 1.0)) * kFourOscFilterFreqRange;
  }
  if (parameterId == "filter.resonance") {
    return static_cast<float>(std::clamp(uiValue, 0.0, 1.0)) * kFourOscFilterResonanceRange;
  }
  return static_cast<float>(std::clamp(uiValue, 0.0, 1.0));
}

void syncInstrumentAutomationCurve(
    te::AutomatableParameter* parameter,
    const UiTrackAutomationLane* lane,
    const std::string& parameterId,
    bool readEnabled) {
  if (parameter == nullptr) {
    return;
  }

  auto& curve = parameter->getCurve();
  curve.clear(nullptr);
  curve.bypass = !readEnabled;
  if (lane == nullptr || lane->points.empty()) {
    return;
  }

  for (const auto& point : lane->points) {
    curve.addPoint(
        te::EditPosition(tracktion::BeatPosition::fromBeats(std::max(0.0, point.beat))),
        instrumentAutomationCurveValue(parameterId, point.value),
        0.0f,
        nullptr);
  }
}

void syncTrackAutomationCurves(
    te::VolumeAndPanPlugin& volume,
    const UiTrackRecord& uiTrack) {
  // The native curves are the playback-owned representation. We still set the
  // current fader/pan after this for immediate scrubbing, but those values no
  // longer have to stand in for the whole automation lane during playback.
  const bool readEnabled = trackAutomationReadEnabled(uiTrack);
  syncTracktionAutomationCurve(
      volume.volParam.get(),
      findTrackAutomationLane(uiTrack, "track", "volumeDb"),
      "volumeDb",
      readEnabled);
  syncTracktionAutomationCurve(
      volume.panParam.get(),
      findTrackAutomationLane(uiTrack, "track", "pan"),
      "pan",
      readEnabled);
}

void syncFxAutomationCurves(te::AudioTrack& track, const UiTrackRecord& uiTrack) {
  const bool readEnabled = trackAutomationReadEnabled(uiTrack);
  for (auto* plugin : track.pluginList) {
    auto* fx = dynamic_cast<MusicAppAirwindowsFxPlugin*>(plugin);
    if (fx == nullptr) {
      continue;
    }

    for (auto* parameter : fx->getAutomatableParameters()) {
      if (parameter == nullptr) {
        continue;
      }

      const auto laneId = fx->slotId() + "." + parameter->paramID.toStdString();
      syncNormalisedAutomationCurve(
          parameter,
          findTrackAutomationLane(uiTrack, "fx", laneId),
          readEnabled);
    }
  }
}

void syncInstrumentAutomationCurves(te::AudioTrack& track, const UiTrackRecord& uiTrack) {
  auto* fourOsc = findFourOscOnTrack(track);
  if (fourOsc == nullptr) {
    return;
  }

  syncInstrumentAutomationCurve(
      fourOsc->filterFreq.get(),
      findTrackAutomationLane(uiTrack, "instrument", "filter.cutoff"),
      "filter.cutoff",
      trackAutomationReadEnabled(uiTrack));
  syncInstrumentAutomationCurve(
      fourOsc->filterResonance.get(),
      findTrackAutomationLane(uiTrack, "instrument", "filter.resonance"),
      "filter.resonance",
      trackAutomationReadEnabled(uiTrack));
}

}  // namespace

void applyTrackMixState(
    te::Edit& edit,
    const ProjectState& projectState,
    double automationEvaluationBeat) {
  const auto tracks = te::getAudioTracks(edit);
  const auto& uiTracks = projectState.uiTracks();

  bool anySolo = false;
  for (const auto& uiTrack : uiTracks) {
    if (uiTrack.isSolo) {
      anySolo = true;
      break;
    }
  }

  for (std::size_t index = 0; index < uiTracks.size(); ++index) {
    if (index >= static_cast<std::size_t>(tracks.size())) {
      break;
    }

    auto* track = tracks[static_cast<int>(index)];
    if (track == nullptr) {
      continue;
    }

    const auto& uiTrack = uiTracks[index];
    const bool shouldMute = uiTrack.isMuted || (anySolo && !uiTrack.isSolo);
    track->setMute(shouldMute);
    track->setSolo(uiTrack.isSolo);

    if (auto* gainTrim = ensureGainTrimPlugin(edit, *track)) {
      gainTrim->setGainDb(uiTrack.gainDb);
    }

    if (auto* volume = track->getVolumePlugin()) {
      // This is intentionally a sync-boundary read path. The UI sends JSON
      // automation metadata to the C++ core, and C++ owns the value that gets
      // written to Tracktion; the later sample-accurate curve pass can build on
      // the same evaluator without moving any audio decisions into JavaScript.
      const auto faderDb =
          static_cast<float>(automationAppliedTrackVolumeDb(uiTrack, automationEvaluationBeat));
      const auto pan =
          static_cast<float>(automationAppliedTrackPan(uiTrack, automationEvaluationBeat));
      volume->setVolumeDb(faderDb);
      volume->setPan(pan);
      syncTrackAutomationCurves(*volume, uiTrack);
    }
    syncInstrumentAutomationCurves(*track, uiTrack);
    syncFxAutomationCurves(*track, uiTrack);
  }
}

}  // namespace musicapp
