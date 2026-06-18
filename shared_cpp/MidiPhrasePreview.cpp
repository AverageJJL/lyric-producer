#include "MidiPhrasePreview.h"

#include "ArrangementCommandHelpers.h"
#include "JsonResponse.h"
#include "SampleOneShotPlayer.h"
#include "TempoSequenceTime.h"

#include <algorithm>
#include <nlohmann/json.hpp>
#include <tracktion_engine/tracktion_engine.h>
#include <vector>

namespace te = tracktion::engine;

namespace musicapp {

namespace {

struct PreviewNote {
  int note = 60;
  int velocity = 100;
  double startBeat = 0.0;
  double lengthBeats = 0.5;
};

struct MidiPhrasePreviewSession {
  bool active = false;
  std::string trackId;
  double lengthBeats = 4.0;
  double savedRestoreBeat = 0.0;
};

MidiPhrasePreviewSession phrasePreviewSession;
te::Edit* phrasePreviewEdit = nullptr;
ProjectState* phrasePreviewProjectState = nullptr;

void addNoteToClip(
    te::MidiClip* midiClip,
    int noteNumber,
    int velocity,
    tracktion::BeatPosition start,
    tracktion::BeatDuration duration) {
  midiClip->getSequence().addNote(noteNumber, start, duration, velocity, 0, nullptr);
}

std::vector<PreviewNote> parseNotes(const nlohmann::json& payload, double lengthBeats) {
  std::vector<PreviewNote> notes;
  if (!payload.contains("notes") || !payload["notes"].is_array()) {
    return notes;
  }

  for (const auto& item : payload["notes"]) {
    if (!item.is_object()) {
      continue;
    }
    PreviewNote note;
    note.note = std::clamp(item.value("note", 60), 0, 127);
    note.velocity = std::clamp(item.value("velocity", 100), 1, 127);
    note.startBeat = std::clamp(item.value("startBeat", 0.0), 0.0, lengthBeats);
    note.lengthBeats = std::clamp(item.value("lengthBeats", 0.5), 0.05, lengthBeats);
    if (note.startBeat + note.lengthBeats > lengthBeats) {
      note.lengthBeats = std::max(0.05, lengthBeats - note.startBeat);
    }
    notes.push_back(note);
  }
  return notes;
}

te::AudioTrack* previewTrack(te::Edit& edit, ProjectState& projectState) {
  return trackForId(edit, projectState, phrasePreviewSession.trackId);
}

tracktion::TimeRange previewLoopTimeRange(te::Edit& edit, double lengthBeats) {
  const auto start = te::toTime(
      tracktion::BeatPosition::fromBeats(kDrumPreviewRegionStartBeat),
      edit.tempoSequence);
  const auto end = te::toTime(
      tracktion::BeatPosition::fromBeats(kDrumPreviewRegionStartBeat + lengthBeats),
      edit.tempoSequence);
  return {start, end - start};
}

bool insertPreviewClip(
    te::Edit& edit,
    ProjectState& projectState,
    const std::vector<PreviewNote>& notes) {
  auto* track = previewTrack(edit, projectState);
  if (track == nullptr) {
    return false;
  }

  clearPreviewClipsOnTrack(*track);
  const auto timeRange = beatRangeToTimeRange(
      edit,
      kDrumPreviewRegionStartBeat,
      phrasePreviewSession.lengthBeats);
  auto midiClip = track->insertMIDIClip("__preview__copilot-midi-phrase", timeRange, nullptr);
  if (midiClip == nullptr) {
    return false;
  }

  for (const auto& note : notes) {
    addNoteToClip(
        midiClip.get(),
        note.note,
        note.velocity,
        tracktion::BeatPosition::fromBeats(note.startBeat),
        tracktion::BeatDuration::fromBeats(note.lengthBeats));
  }
  return true;
}

double currentTransportBeat(te::Edit& edit) {
  return beatAtSeconds(edit.tempoSequence, edit.getTransport().getPosition().inSeconds());
}

}  // namespace

bool isMidiPhrasePreviewActive() {
  return phrasePreviewSession.active;
}

CommandResult handleStartMidiPhrasePreview(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId") || !payload["trackId"].is_string()) {
    return makeError(
        "start_midi_phrase_preview",
        "invalid_payload",
        "Expected payload { trackId, lengthBeats, notes }.");
  }

  const auto trackId = payload["trackId"].get<std::string>();
  const auto lengthBeats = std::clamp(payload.value("lengthBeats", 4.0), 0.25, 64.0);
  auto notes = parseNotes(payload, lengthBeats);
  if (notes.empty()) {
    return makeError("start_midi_phrase_preview", "invalid_payload", "notes must not be empty.");
  }

  if (phrasePreviewSession.active) {
    handleStopMidiPhrasePreview();
  }

  phrasePreviewSession = {};
  phrasePreviewSession.active = true;
  phrasePreviewSession.trackId = trackId;
  phrasePreviewSession.lengthBeats = lengthBeats;
  phrasePreviewSession.savedRestoreBeat =
      currentTransportBeat(edit) < kDrumPreviewRegionStartBeat - 1.0
          ? currentTransportBeat(edit)
          : 0.0;
  phrasePreviewEdit = &edit;
  phrasePreviewProjectState = &projectState;

  if (!insertPreviewClip(edit, projectState, notes)) {
    phrasePreviewSession = {};
    phrasePreviewEdit = nullptr;
    phrasePreviewProjectState = nullptr;
    return makeError("start_midi_phrase_preview", "track_not_found", "Track ID is not mapped.");
  }

  auto& transport = edit.getTransport();
  transport.ensureContextAllocated();
  transport.setLoopRange(previewLoopTimeRange(edit, phrasePreviewSession.lengthBeats));
  transport.looping = true;
  transport.setPosition(te::toTime(
      tracktion::BeatPosition::fromBeats(kDrumPreviewRegionStartBeat),
      edit.tempoSequence));
  transport.play(false);

  nlohmann::json data;
  data["trackId"] = phrasePreviewSession.trackId;
  data["lengthBeats"] = phrasePreviewSession.lengthBeats;
  data["noteCount"] = notes.size();
  return makeSuccess("start_midi_phrase_preview", data.dump());
}

CommandResult handleStopMidiPhrasePreview() {
  const double restoreBeat = phrasePreviewSession.savedRestoreBeat;
  if (phrasePreviewEdit != nullptr && phrasePreviewSession.active) {
    restoreLinearTransport(*phrasePreviewEdit, restoreBeat);
  }
  if (
      phrasePreviewEdit != nullptr &&
      phrasePreviewProjectState != nullptr &&
      phrasePreviewSession.active) {
    if (auto* track = previewTrack(*phrasePreviewEdit, *phrasePreviewProjectState)) {
      clearPreviewClipsOnTrack(*track);
    }
  }
  phrasePreviewSession = {};
  phrasePreviewEdit = nullptr;
  phrasePreviewProjectState = nullptr;
  return makeSuccess("stop_midi_phrase_preview", "{}");
}

}  // namespace musicapp
