#include "InstrumentCommands.h"

#include "SampleOneShotPlayer.h"
#include "FourOscPresets.h"
#include "JsonResponse.h"
#include "TransportBeat.h"

#include <nlohmann/json.hpp>
#include <tracktion_engine/tracktion_engine.h>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace te = tracktion::engine;

namespace musicapp {

namespace {

struct CapturedNote {
  int note = 60;
  int velocity = 100;
  double startBeat = 0.0;
  double lengthBeats = 0.5;
};

struct RecordingSession {
  bool active = false;
  std::string trackId;
  std::string clipId;
  double clipStartBeat = 0.0;
  double sessionStartBeat = 0.0;
  std::unordered_map<int, double> noteOnBeats;
  std::vector<CapturedNote> notes;
};

RecordingSession recordingSession;
std::unordered_map<std::string, std::unordered_set<int>> activeNotesByTrack;
std::unordered_map<std::string, std::vector<te::Clip*>> previewClipsByTrack;

void clearPreviewClips(const std::string& trackId) {
  const auto it = previewClipsByTrack.find(trackId);
  if (it == previewClipsByTrack.end()) {
    return;
  }

  for (auto* clip : it->second) {
    if (clip != nullptr) {
      clip->removeFromParent();
    }
  }

  it->second.clear();
}

te::AudioTrack* resolveTrack(te::Edit& edit, const ProjectState& projectState, const std::string& trackId) {
  const int index = projectState.trackIndexForId(trackId);
  if (index < 0) {
    return nullptr;
  }

  const auto tracks = te::getAudioTracks(edit);
  if (index >= tracks.size()) {
    return nullptr;
  }

  return tracks[index];
}

bool isTrackAudibleForLiveInput(const ProjectState& projectState, const std::string& trackId) {
  const auto& uiTracks = projectState.uiTracks();
  bool anySolo = false;
  for (const auto& track : uiTracks) {
    if (track.isSolo) {
      anySolo = true;
      break;
    }
  }

  for (const auto& track : uiTracks) {
    if (track.id != trackId) {
      continue;
    }

    if (track.isMuted) {
      return false;
    }

    if (anySolo && !track.isSolo) {
      return false;
    }

    return true;
  }

  return true;
}

void recordNoteOn(const ProjectState& projectState, const std::string& trackId, int note, int velocity, double beat) {
  if (!projectState.isTrackRecordArmed(trackId) || !recordingSession.active
      || recordingSession.trackId != trackId) {
    return;
  }

  recordingSession.noteOnBeats[note] = beat;
  juce::ignoreUnused(velocity);
}

void recordNoteOff(const std::string& trackId, int note, double beat) {
  if (!recordingSession.active || recordingSession.trackId != trackId) {
    return;
  }

  const auto it = recordingSession.noteOnBeats.find(note);
  if (it == recordingSession.noteOnBeats.end()) {
    return;
  }

  const double startBeat = it->second - recordingSession.clipStartBeat;
  const double lengthBeats = std::max(0.05, beat - it->second);
  recordingSession.notes.push_back({note, 100, startBeat, lengthBeats});
  recordingSession.noteOnBeats.erase(it);
}

}  // namespace

te::FourOscPlugin* findFourOscOnTrack(te::AudioTrack& track) {
  for (auto plugin : track.pluginList) {
    if (auto* fourOsc = dynamic_cast<te::FourOscPlugin*>(plugin)) {
      return fourOsc;
    }
  }
  return nullptr;
}

void applyPresetToTrack(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& trackId,
    const std::string& presetId) {
  projectState.setTrackPreset(trackId, presetId);

  auto* track = resolveTrack(edit, projectState, trackId);
  if (track == nullptr) {
    return;
  }

  if (auto* fourOsc = findFourOscOnTrack(*track)) {
    applyFourOscPreset(*fourOsc, presetId);
  }
}

CommandResult handleMidiNoteOn(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId") || !payload.contains("note")) {
    return makeError("midi_note_on", "invalid_payload", "Expected payload { trackId, note, velocity? }.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  const int note = payload["note"].get<int>();
  const int velocity = payload.value("velocity", 100);
  const int channel = payload.value("channel", 0);

  auto* track = resolveTrack(edit, projectState, trackId);
  if (track == nullptr) {
    return makeError("midi_note_on", "track_not_found", "Track ID is not mapped.");
  }

  if (!isTrackAudibleForLiveInput(projectState, trackId)) {
    nlohmann::json data;
    data["ignored"] = true;
    return makeSuccess("midi_note_on", data.dump());
  }

  const float velocityFloat = juce::jlimit(0.0f, 1.0f, static_cast<float>(velocity) / 127.0f);
  const te::MidiMessageWithSource message(
      juce::MidiMessage::noteOn(channel + 1, note, velocityFloat), 0);
  track->injectLiveMidiMessage(message);
  activeNotesByTrack[trackId].insert(note);
  recordNoteOn(projectState, trackId, note, velocity, readTransportBeat(edit));

  nlohmann::json data;
  data["trackId"] = trackId;
  data["note"] = note;
  return makeSuccess("midi_note_on", data.dump());
}

CommandResult handleMidiNoteOff(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId") || !payload.contains("note")) {
    return makeError("midi_note_off", "invalid_payload", "Expected payload { trackId, note }.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  const int note = payload["note"].get<int>();
  const int channel = payload.value("channel", 0);

  auto* track = resolveTrack(edit, projectState, trackId);
  if (track == nullptr) {
    return makeError("midi_note_off", "track_not_found", "Track ID is not mapped.");
  }

  const te::MidiMessageWithSource message(
      juce::MidiMessage::noteOff(channel + 1, note), 0);
  track->injectLiveMidiMessage(message);
  activeNotesByTrack[trackId].erase(note);
  recordNoteOff(trackId, note, readTransportBeat(edit));

  nlohmann::json data;
  data["trackId"] = trackId;
  data["note"] = note;
  return makeSuccess("midi_note_off", data.dump());
}

CommandResult handleMidiAllNotesOff(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = payloadJson.empty() ? nlohmann::json::object()
                                               : nlohmann::json::parse(payloadJson, nullptr, false);
  const std::string trackId = payload.value("trackId", std::string{});

  const auto& uiTracks = projectState.uiTracks();
  for (const auto& uiTrack : uiTracks) {
    if (!trackId.empty() && uiTrack.id != trackId) {
      continue;
    }

    auto* track = resolveTrack(edit, projectState, uiTrack.id);
    if (track == nullptr) {
      continue;
    }

    for (int note = 0; note < 128; ++note) {
      const te::MidiMessageWithSource message(juce::MidiMessage::noteOff(1, note), 0);
      track->injectLiveMidiMessage(message);
    }
    activeNotesByTrack[uiTrack.id].clear();
  }

  return makeSuccess("midi_all_notes_off", "{}");
}

CommandResult handlePlaySample(
    te::Engine& engine,
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson,
    EngineDelayedTaskScheduler scheduleOnEngineThread) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId") || !payload.contains("sampleKey")) {
    return makeError(
        "play_sample",
        "invalid_payload",
        "Expected payload { trackId, sampleKey, velocity? }.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  const auto sampleKey = payload["sampleKey"].get<std::string>();
  const int stepIndex = payload.value("step", 0);
  return triggerSampleOneShot(
      engine,
      edit,
      projectState,
      trackId,
      sampleKey,
      stepIndex,
      std::move(scheduleOnEngineThread));
}

CommandResult handleListInstrumentPresets(const std::string& payloadJson) {
  nlohmann::json payload = payloadJson.empty() ? nlohmann::json::object()
                                               : nlohmann::json::parse(payloadJson, nullptr, false);
  const auto instrumentId = payload.value("instrumentId", std::string{"four_osc"});

  nlohmann::json presets = nlohmann::json::array();
  if (instrumentId == "four_osc") {
    presets.push_back({{"id", "electric_keys"}, {"name", "Electric Keys"}, {"category", "Keys"}});
    presets.push_back({{"id", "organ_drawbar"}, {"name", "Drawbar Organ"}, {"category", "Keys"}});
    presets.push_back({{"id", "pop_lead"}, {"name", "Pop Lead"}, {"category", "Lead"}});
    presets.push_back({{"id", "warm_pad"}, {"name", "Warm Pad"}, {"category", "Pad"}});
    presets.push_back({{"id", "string_ensemble"}, {"name", "String Ensemble"}, {"category", "Strings"}});
    presets.push_back({{"id", "airy_flute"}, {"name", "Airy Flute"}, {"category", "Winds"}});
    presets.push_back({{"id", "brass_stack"}, {"name", "Brass Stack"}, {"category", "Brass"}});
    presets.push_back({{"id", "bell_mallet"}, {"name", "Bell Mallet"}, {"category", "Mallets"}});
    presets.push_back({{"id", "pluck_bright"}, {"name", "Bright Pluck"}, {"category", "Pluck"}});
    presets.push_back({{"id", "808_sub"}, {"name", "808 Sub"}, {"category", "Bass"}});
    presets.push_back({{"id", "bass_sub"}, {"name", "Sub Bass"}, {"category", "Bass"}});
  } else if (instrumentId == "sample_instrument") {
    presets.push_back({{"id", "splendid_grand_lite"}, {"name", "Grand Piano"}, {"category", "Keys"}});
    presets.push_back({{"id", "growly_bass_lite"}, {"name", "Electric Bass"}, {"category", "Bass"}});
    presets.push_back({{"id", "emily_guitar_lite"}, {"name", "Electric Guitar"}, {"category", "Guitar"}});
  } else if (instrumentId == "pop_basic" || instrumentId == "sample_kit") {
    presets.push_back({{"id", "pop_basic"}, {"name", "Pop Basic"}, {"category", "Drums"}});
  }

  nlohmann::json data;
  data["instrumentId"] = instrumentId;
  data["presets"] = presets;
  return makeSuccess("list_instrument_presets", data.dump());
}

CommandResult handleSetTrackPreset(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId") || !payload.contains("presetId")) {
    return makeError("set_track_preset", "invalid_payload", "Expected payload { trackId, presetId }.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  const auto presetId = payload["presetId"].get<std::string>();
  applyPresetToTrack(edit, projectState, trackId, presetId);

  nlohmann::json data;
  data["trackId"] = trackId;
  data["presetId"] = presetId;
  return makeSuccess("set_track_preset", data.dump());
}

CommandResult handleSetRecordArm(ProjectState& projectState, const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId") || !payload.contains("armed")) {
    return makeError("set_record_arm", "invalid_payload", "Expected payload { trackId, armed }.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  const bool armed = payload["armed"].get<bool>();
  projectState.setTrackRecordArmed(trackId, armed);

  nlohmann::json data;
  data["trackId"] = trackId;
  data["armed"] = armed;
  return makeSuccess("set_record_arm", data.dump());
}

CommandResult handleStartRecording(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson,
    const EngineEventEmitter& emitEvent) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId")) {
    return makeError("start_recording", "invalid_payload", "Expected payload { trackId, clipId?, startBeat? }.");
  }

  recordingSession = {};
  recordingSession.active = true;
  recordingSession.trackId = payload["trackId"].get<std::string>();
  recordingSession.clipId = payload.value("clipId", std::string{});
  recordingSession.clipStartBeat = payload.value("startBeat", readTransportBeat(edit));
  recordingSession.sessionStartBeat = readTransportBeat(edit);

  nlohmann::json data;
  data["trackId"] = recordingSession.trackId;
  data["clipId"] = recordingSession.clipId;
  data["startBeat"] = recordingSession.clipStartBeat;
  data["isRecording"] = true;

  if (emitEvent) {
    nlohmann::json eventPayload = data;
    eventPayload["event"] = "recordingStarted";
    emitEvent("onRecordingUpdate", eventPayload.dump());
  }

  return makeSuccess("start_recording", data.dump());
}

CommandResult handleStopRecording(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson,
    const EngineEventEmitter& emitEvent) {
  juce::ignoreUnused(projectState, payloadJson);

  const double stopBeat = readTransportBeat(edit);
  for (const auto& [note, onBeat] : recordingSession.noteOnBeats) {
    const double startBeat = onBeat - recordingSession.clipStartBeat;
    const double lengthBeats = std::max(0.05, stopBeat - onBeat);
    recordingSession.notes.push_back({note, 100, startBeat, lengthBeats});
  }
  recordingSession.noteOnBeats.clear();

  nlohmann::json notes = nlohmann::json::array();
  for (const auto& captured : recordingSession.notes) {
    notes.push_back({
        {"note", captured.note},
        {"velocity", captured.velocity},
        {"startBeat", captured.startBeat},
        {"lengthBeats", captured.lengthBeats},
    });
  }

  nlohmann::json data;
  data["trackId"] = recordingSession.trackId;
  data["clipId"] = recordingSession.clipId;
  data["notes"] = notes;
  data["isRecording"] = false;

  if (emitEvent) {
    nlohmann::json eventPayload = data;
    eventPayload["event"] = "recordingStopped";
    emitEvent("onRecordingUpdate", eventPayload.dump());
  }

  recordingSession = {};
  return makeSuccess("stop_recording", data.dump());
}

}  // namespace musicapp
