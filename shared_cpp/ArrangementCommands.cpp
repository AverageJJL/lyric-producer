#include "ArrangementCommands.h"

#include "ArrangementCommandHelpers.h"
#include "FourOscPresets.h"
#include "InstrumentCommands.h"
#include "JsonResponse.h"
#include "SamplerInstrumentCommands.h"

#include <nlohmann/json.hpp>
#include <tracktion_engine/tracktion_engine.h>
#include <unordered_map>

namespace te = tracktion::engine;

namespace musicapp {

namespace {

void addNoteToClip(
    te::MidiClip* midiClip,
    int noteNumber,
    int velocity,
    tracktion::BeatPosition start,
    tracktion::BeatDuration duration) {
  midiClip->getSequence().addNote(noteNumber, start, duration, velocity, 0, nullptr);
}

bool trackHasFourOsc(te::AudioTrack& track) {
  for (auto plugin : track.pluginList) {
    if (dynamic_cast<te::FourOscPlugin*>(plugin) != nullptr) {
      return true;
    }
  }
  return false;
}

void removeFourOscPlugins(te::AudioTrack& track) {
  const auto plugins = track.pluginList.getPlugins();
  for (auto* plugin : plugins) {
    if (dynamic_cast<te::FourOscPlugin*>(plugin) != nullptr) {
      plugin->deleteFromParent();
    }
  }
}

}  // namespace

CommandResult handleSetAssetRoot(ProjectState& projectState, const std::string& payloadJson) {
  nlohmann::json payload = payloadJson.empty() ? nlohmann::json::object()
                                               : nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded()) {
    return makeError("set_asset_root", "invalid_payload", "Expected JSON object.");
  }

  const std::string root = payload.value("root", payload.value("relativePath", std::string{}));
  if (root.empty()) {
    return makeError("set_asset_root", "invalid_payload", "Expected payload { \"root\": string }.");
  }

  projectState.setAssetRoot(root);

  const std::string writableRoot = payload.value("writableRoot", std::string{});
  if (!writableRoot.empty()) {
    projectState.setWritableAssetRoot(writableRoot);
    juce::File writableDir(writableRoot);
    writableDir.getChildFile("recordings").createDirectory();
  }

  nlohmann::json data;
  data["assetRoot"] = projectState.assetRoot();
  data["writableAssetRoot"] = projectState.writableAssetRoot();
  return makeSuccess("set_asset_root", data.dump());
}

CommandResult handleAssignTrackInstrument(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId")) {
    return makeError(
        "assign_track_instrument",
        "invalid_payload",
        "Expected payload { \"trackId\": string, \"instrument\": string }.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  const auto instrument = payload.value("instrument", std::string{"four_osc"});
  auto* track = trackForId(edit, projectState, trackId);
  if (track == nullptr) {
    return makeError("assign_track_instrument", "track_not_found", "Track ID is not mapped.");
  }

  const std::string presetId = payload.value(
      "presetId",
      payload.contains("params") ? payload["params"].value("preset", std::string{"pop_lead"})
                                 : std::string{"pop_lead"});

  if (instrument == "four_osc") {
    removeSamplerPlugins(*track);
    if (!trackHasFourOsc(*track)) {
      auto plugin = edit.getPluginCache().createNewPlugin(te::FourOscPlugin::xmlTypeName, {}).get();
      auto* fourOsc = dynamic_cast<te::FourOscPlugin*>(plugin);
      if (fourOsc == nullptr) {
        return makeError(
            "assign_track_instrument",
            "plugin_create_failed",
            "Could not create 4OSC plugin.");
      }
      track->pluginList.insertPlugin(*fourOsc, 0, nullptr);
    }

    if (auto* fourOsc = findFourOscOnTrack(*track)) {
      applyFourOscPreset(*fourOsc, presetId);
    }
    projectState.setTrackPreset(trackId, presetId);
  } else if (instrument == "sample_instrument") {
    const auto samplerResult = configureSamplerInstrument(edit, projectState, *track, trackId, payload);
    if (!samplerResult.ok) {
      return samplerResult;
    }
    removeFourOscPlugins(*track);
  } else if (instrument == "sample_kit") {
    removeFourOscPlugins(*track);
    removeSamplerPlugins(*track);
    projectState.setTrackPreset(trackId, presetId);
    if (payload.contains("params") && payload["params"].contains("samples")
        && payload["params"]["samples"].is_object()) {
      std::unordered_map<std::string, std::string> samples;
      for (const auto& [key, value] : payload["params"]["samples"].items()) {
        if (value.is_string()) {
          samples[key] = value.get<std::string>();
        }
      }
      projectState.setDrumKitSamples(trackId, samples);
    }
  }

  projectState.setTrackInstrument(trackId, instrument);

  nlohmann::json data;
  data["trackId"] = trackId;
  data["instrument"] = instrument;
  data["presetId"] = projectState.trackPreset(trackId);
  return makeSuccess("assign_track_instrument", data.dump());
}

CommandResult handleUpsertMidiClip(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("clipId") || !payload.contains("trackId")) {
    return makeError(
        "upsert_midi_clip",
        "invalid_payload",
        "Expected payload with clipId, trackId, startBeat, lengthBeats, notes.");
  }

  const auto clipId = payload["clipId"].get<std::string>();
  const auto trackId = payload["trackId"].get<std::string>();
  const double startBeat = payload.value("startBeat", 0.0);
  const double lengthBeats = payload.value("lengthBeats", 4.0);
  const auto clipName = payload.value("name", std::string{"MIDI Clip"});

  auto* track = trackForId(edit, projectState, trackId);
  if (track == nullptr) {
    return makeError("upsert_midi_clip", "track_not_found", "Track ID is not mapped.");
  }

  if (hasClipGroup(clipId)) {
    removeClipGroup(projectState, clipId);
  }

  const auto timeRange = beatRangeToTimeRange(edit, startBeat, lengthBeats);
  auto midiClip = track->insertMIDIClip(clipName, timeRange, nullptr);
  if (midiClip == nullptr) {
    return makeError("upsert_midi_clip", "clip_create_failed", "Could not create MIDI clip.");
  }

  if (payload.contains("notes") && payload["notes"].is_array()) {
    for (const auto& note : payload["notes"]) {
      const double noteStart = note.value("startBeat", 0.0);
      addNoteToClip(
          midiClip.get(),
          note.value("note", 60),
          note.value("velocity", 100),
          tracktion::BeatPosition::fromBeats(noteStart),
          tracktion::BeatDuration::fromBeats(note.value("lengthBeats", 0.5)));
    }
  }

  rememberClipGroup(clipId, {midiClip.get()});

  nlohmann::json data;
  data["clipId"] = clipId;
  data["trackId"] = trackId;
  data["noteCount"] = payload.contains("notes") && payload["notes"].is_array()
                          ? payload["notes"].size()
                          : 0;
  return makeSuccess("upsert_midi_clip", data.dump());
}

CommandResult handleDeleteClip(ProjectState& projectState, const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("clipId")) {
    return makeError("delete_clip", "invalid_payload", "Expected payload { \"clipId\": string }.");
  }

  const auto clipId = payload["clipId"].get<std::string>();
  removeClipGroup(projectState, clipId);

  nlohmann::json data;
  data["clipId"] = clipId;
  return makeSuccess("delete_clip", data.dump());
}

CommandResult handleSetLoopRange(te::Edit& edit, const std::string& payloadJson) {
  nlohmann::json payload = payloadJson.empty() ? nlohmann::json::object()
                                               : nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded()) {
    return makeError("set_loop_range", "invalid_payload", "Expected JSON object.");
  }

  const double startBeat = payload.value("startBeat", 0.0);
  const double lengthBeats = payload.value("lengthBeats", 4096.0);
  const bool looping = payload.value("looping", false);
  const auto loopRange = beatRangeToTimeRange(edit, startBeat, lengthBeats);

  auto& transport = edit.getTransport();
  transport.setLoopRange(loopRange);
  transport.looping = looping;

  nlohmann::json data;
  data["startBeat"] = startBeat;
  data["lengthBeats"] = lengthBeats;
  return makeSuccess("set_loop_range", data.dump());
}

}  // namespace musicapp
