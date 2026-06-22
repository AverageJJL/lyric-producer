#include "AudioEngineController.h"

#include "ArrangementCommandHelpers.h"
#include "DrumPatternPreview.h"
#include "SampleOneShotPlayer.h"

#include "ArrangementCommands.h"
#include "AmpSimCommands.h"
#include "EngineEventPublisher.h"
#include "AskMeasurementCommands.h"
#include "AudioInputCapture.h"
#include "InstrumentCommands.h"
#include "InstrumentParameterCommands.h"
#include "InputMeterState.h"
#include "JuceMessageThread.h"
#include "JsonResponse.h"
#include "MediaAnalysisCommands.h"
#include "MediaPreparationCommands.h"
#include "MeterSnapshot.h"
#include "MidiPhrasePreview.h"
#include "MixdownRenderManager.h"
#include "MusicAppEngineBehaviour.h"
#include "PlaybackDeviceRouting.h"
#include "ProjectState.h"
#include "RoutingGraphCommands.h"
#include "SpectrogramCommands.h"
#include "TempoMapCommands.h"
#include "TrackAutomationCaptureCommands.h"
#include "TrackFxCommands.h"
#include "TrackFxExternalPluginInsert.h"
#include "TrackFxExternalPluginProbe.h"
#include "TrackFxPluginScan.h"
#include "TrackGraphSignature.h"
#include "TrackMixCommands.h"
#include "TrackOutputRouting.h"
#include "TrackSidechainRouting.h"
#include "TransportBeat.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <nlohmann/json.hpp>
#include <optional>

#include <tracktion_engine/tracktion_engine.h>
#include <vector>

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

double jsonFiniteNumberOr(
    const nlohmann::json& object,
    const std::string& key,
    double fallback) {
  const auto it = object.find(key);
  if (it == object.end() || !it->is_number()) {
    return fallback;
  }

  const double value = it->get<double>();
  return std::isfinite(value) ? value : fallback;
}

std::string jsonStringOr(
    const nlohmann::json& object,
    const std::string& key,
    std::string fallback) {
  const auto it = object.find(key);
  return it != object.end() && it->is_string() ? it->get<std::string>() : fallback;
}

std::vector<UiTrackAutomationLane> parseAutomationLanes(const nlohmann::json& track) {
  std::vector<UiTrackAutomationLane> lanes;
  if (!track.contains("automationLanes") || !track["automationLanes"].is_array()) {
    return lanes;
  }

  for (const auto& laneJson : track["automationLanes"]) {
    if (!laneJson.is_object()) {
      continue;
    }
    const auto targetType = jsonStringOr(laneJson, "targetType", {});
    if (targetType != "track" && targetType != "fx" && targetType != "instrument") {
      continue;
    }
    const auto parameterId = jsonStringOr(laneJson, "parameterId", {});
    if (parameterId.empty()) {
      continue;
    }

    UiTrackAutomationLane lane;
    lane.targetType = targetType;
    lane.parameterId = parameterId;
    if (laneJson.contains("points") && laneJson["points"].is_array()) {
      for (const auto& pointJson : laneJson["points"]) {
        if (!pointJson.is_object()) {
          continue;
        }
        UiTrackAutomationPoint point;
        point.beat = std::max(0.0, jsonFiniteNumberOr(pointJson, "beat", 0.0));
        point.value = jsonFiniteNumberOr(pointJson, "value", 0.0);
        lane.points.push_back(point);
      }
    }
    std::sort(lane.points.begin(), lane.points.end(), [](const auto& left, const auto& right) {
      return left.beat < right.beat;
    });
    lanes.push_back(std::move(lane));
  }

  return lanes;
}

template <typename Values>
nlohmann::json numericArrayJson(const Values& values) {
  nlohmann::json data = nlohmann::json::array();
  for (const auto& value : values) {
    data.push_back(value);
  }
  return data;
}

}  // namespace

class AudioEngineController::Impl {
 public:
  Impl() = default;

  std::string initialize() {
    if (initialized_) {
      return commandResultToJson(makeSuccess("engine_init", statusJson()));
    }

    messageThread_.start();

    return messageThread_.runSync([this] {
      engine_ = std::make_unique<te::Engine>(
          "MusicApp",
          std::unique_ptr<te::UIBehaviour>{},
          createMusicAppEngineBehaviour());
      createDefaultEdit();
      eventPublisher_ = std::make_unique<EngineEventPublisher>(
          *owner_,
          [this](EngineTask task) { messageThread_.post(std::move(task)); });
      if (eventCallback_) {
        eventPublisher_->setCallback(eventCallback_);
      }
      eventPublisher_->start();
      initialized_ = true;
      return commandResultToJson(makeSuccess("engine_init", statusJson()));
    });
  }

  std::string shutdown() {
    return messageThread_.runSync([this] {
      if (!initialized_) {
        return commandResultToJson(makeSuccess("engine_shutdown"));
      }

      handleStopPatternPreview();
      cancelSampleOneShotAuditions();
      releaseMicCaptureForPlayback();
      if (eventPublisher_) {
        eventPublisher_->stop();
        eventPublisher_.reset();
      }

      meterSnapshotReader_.reset();
      edit_.reset();
      engine_.reset();
      initialized_ = false;
      return commandResultToJson(makeSuccess("engine_shutdown"));
    });
  }

  std::string getStatusJson() const {
    return const_cast<Impl*>(this)->statusJson();
  }

  std::string getTransportStatusJson() const {
    nlohmann::json data;
    appendTransportStatus(data);
    return data.dump();
  }

  std::string getMeterSnapshotJson() {
    if (!edit_) {
      nlohmann::json payload = {
          {"event", "mixMeterUpdate"},
          {"schemaVersion", 1},
          {"source", "tracktion_level_measurer"},
          {"input", inputMeterSnapshotJson()},
          {"tracks", nlohmann::json::array()},
          {"master", {{"peak", {{"db", -100.0}, {"linear", 0.0}}},
                      {"peakHold", {{"db", -100.0}, {"linear", 0.0}}},
                      {"clipping", false},
                      {"channels", nlohmann::json::array()}}},
      };
      return payload.dump();
    }
    return meterSnapshotReader_.snapshotJson(*edit_, projectState_);
  }

  std::string dispatchOnMessageThread(const std::string& command, const std::string& payloadJson) {
    return messageThread_.runSync([this, command, payloadJson] {
      if (!initialized_ || !engine_ || !edit_) {
        return commandResultToJson(makeError(command, "engine_not_initialized", "Call engine_init first."));
      }

      if (command == "engine_status") {
        return commandResultToJson(makeSuccess(command, statusJson()));
      }

      if (command == "engine_status_fast") {
        return commandResultToJson(makeSuccess(command, statusJson(false)));
      }

      if (command == "render_mixdown_async") {
        return commandResultToJson(
            mixdownRenderManager_.start(*engine_, *edit_, projectState_, payloadJson));
      }

      if (command == "cancel_render_mixdown") {
        return commandResultToJson(mixdownRenderManager_.cancel(payloadJson));
      }

      if (command == "get_render_mixdown_status") {
        return commandResultToJson(mixdownRenderManager_.status(payloadJson));
      }

      if (mixdownRenderManager_.hasRunningRender()) {
        return commandResultToJson(makeError(
            command,
            "render_in_progress",
            "A mixdown render is running; cancel or wait for it before mutating the edit."));
      }

      if (command == "transport_play" || command == "setPlaybackState") {
        return handleTransportPlay(payloadJson);
      }

      if (command == "transport_stop") {
        return handleTransportStop();
      }

      if (command == "return_to_zero" || command == "returnToZero") {
        return handleReturnToZero();
      }

      if (command == "set_transport_position") {
        return handleSetTransportPosition(payloadJson);
      }

      if (command == "set_bpm" || command == "setBpm") {
        return handleSetBpm(payloadJson);
      }

      if (command == "set_tempo_map") {
        return commandResultToJson(handleSetTempoMap(*edit_, payloadJson));
      }

      if (command == "get_tempo_map") {
        return commandResultToJson(handleGetTempoMap(*edit_));
      }

      if (command == "set_click_track") {
        return handleSetClickTrack(payloadJson);
      }

      if (command == "start_count_in_click") {
        return handleStartCountInClick(payloadJson);
      }

      if (command == "stop_count_in_click") {
        return handleStopCountInClick(payloadJson);
      }

      if (command == "setTracks" || command == "set_tracks") {
        return handleSetTracks(payloadJson);
      }

      if (command == "set_master_mix") {
        return handleSetMasterMix(payloadJson);
      }

      if (command == "get_track_mix") {
        double masterVolumeDb = 0.0;
        double masterPan = 0.0;
        if (auto masterVolume = edit_->getMasterVolumePlugin()) {
          masterVolumeDb = masterVolume->getVolumeDb();
          masterPan = masterVolume->getPan();
        }
        const auto result = handleGetTrackMix(
            *edit_,
            projectState_,
            masterVolumeDb,
            masterPan,
            readTransportBeat(*edit_),
            payloadJson);
        return commandResultToJson(result);
      }

      if (command == "get_routing_graph") {
        return commandResultToJson(handleGetRoutingGraph(projectState_, payloadJson));
      }

      if (command == "capture_track_automation") {
        const auto result = handleCaptureTrackAutomation(
            *edit_,
            projectState_,
            readTransportBeat(*edit_),
            payloadJson);
        if (result.ok) {
          applyTrackMixState(*edit_, projectState_, readTransportBeat(*edit_));
        }
        return commandResultToJson(result);
      }

      if (command == "refresh_audio_device") {
        return handleRefreshAudioDevice(payloadJson);
      }

      if (command == "release_mic_capture") {
        releaseMicCaptureForPlayback();
        return commandResultToJson(makeSuccess("release_mic_capture", statusJson()));
      }

      if (command == "set_output_device") {
        return handleSetOutputDevice(payloadJson);
      }

      if (command == "set_input_device") {
        return handleSetInputDevice(payloadJson);
      }

      if (command == "set_audio_device_settings") {
        return handleSetAudioDeviceSettings(payloadJson);
      }

      if (command == "render_mixdown") {
        return handleRenderMixdown(payloadJson);
      }

      if (command == "list_audio_devices") {
        return handleListAudioDevices();
      }

      if (command == "set_asset_root") {
        const auto result = handleSetAssetRoot(projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "set_track_fx") {
        const auto result = handleSetTrackFx(*edit_, projectState_, payloadJson);
        if (result.ok) {
          applyTrackMixState(*edit_, projectState_, readTransportBeat(*edit_));
          playbackRouting_.rebuildPlaybackGraph(*engine_, *edit_);
        }
        return commandResultToJson(result);
      }

      if (command == "get_track_fx") {
        const auto result = handleGetTrackFx(*edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "list_fx_plugins") {
        const auto result = handleListFxPlugins(payloadJson);
        return commandResultToJson(result);
      }

      if (command == "scan_fx_plugins") {
        const auto result = handleScanFxPlugins(payloadJson);
        return commandResultToJson(result);
      }

      if (command == "validate_fx_plugin_insert") {
        const auto result = handleValidateFxPluginInsert(*edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "probe_fx_plugin") {
        const auto result = handleProbeFxPlugin(payloadJson);
        return commandResultToJson(result);
      }

      if (command == "set_amp_sim") {
        const auto result = handleSetAmpSim(*edit_, projectState_, payloadJson);
        if (result.ok) {
          playbackRouting_.rebuildPlaybackGraph(*engine_, *edit_);
        }
        return commandResultToJson(result);
      }

      if (command == "get_amp_sim") {
        const auto result = handleGetAmpSim(*edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "assign_track_instrument") {
        const auto result = handleAssignTrackInstrument(*edit_, projectState_, payloadJson);
        if (result.ok) {
          applyTrackMixState(*edit_, projectState_, readTransportBeat(*edit_));
          playbackRouting_.rebuildPlaybackGraph(*engine_, *edit_);
        }
        return commandResultToJson(result);
      }

      if (command == "upsert_midi_clip") {
        const auto result = handleUpsertMidiClip(*edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "upsert_audio_clip") {
        const auto result = handleUpsertAudioClip(*engine_, *edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "upsert_audio_clips_batch") {
        const auto result = handleUpsertAudioClipsBatch(*engine_, *edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "set_drum_pattern_step") {
        const auto result = handleSetDrumPatternStep(*edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "analyze_audio_file") {
        const auto result = handleAnalyzeAudioFile(*edit_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "prepare_audio_file_for_playback") {
        const auto result = handlePrepareAudioFileForPlayback(payloadJson);
        return commandResultToJson(result);
      }

      if (command == "detect_audio_transients") {
        const auto result = handleDetectAudioTransients(*edit_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "measure_loudness") {
        const auto result = handleMeasureLoudness(*edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "get_spectrum_bands") {
        const auto result = handleGetSpectrumBands(*edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "delete_clip") {
        const auto result = handleDeleteClip(projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "set_loop_range") {
        const auto result = handleSetLoopRange(*edit_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "midi_note_on") {
        if (isMidiPhrasePreviewActive()) {
          handleStopMidiPhrasePreview();
        }
        if (const auto error = playbackRouting_.prepareForAudiblePlayback(*engine_, *edit_)) {
          return commandResultToJson(
              makeError("midi_note_on", "audio_device_unavailable", *error));
        }
        const auto result = handleMidiNoteOn(*edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "midi_note_off") {
        const auto result = handleMidiNoteOff(*edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "play_sample") {
        if (isMidiPhrasePreviewActive()) {
          handleStopMidiPhrasePreview();
        }
        if (const auto error = playbackRouting_.prepareForAudiblePlayback(*engine_, *edit_)) {
          return commandResultToJson(
              makeError("play_sample", "audio_device_unavailable", *error));
        }
        const auto result = handlePlaySample(
            *engine_,
            *edit_,
            projectState_,
            payloadJson,
            [this](std::chrono::milliseconds delay, EngineTask task) {
              messageThread_.postDelayed(delay, std::move(task));
            });
        return commandResultToJson(result);
      }

      if (command == "start_pattern_preview" || command == "update_pattern_preview"
          || command == "stop_pattern_preview") {
        if (command == "start_pattern_preview" && isMidiPhrasePreviewActive()) {
          handleStopMidiPhrasePreview();
        }
        if (command != "stop_pattern_preview") {
          if (const auto error = playbackRouting_.prepareForAudiblePlayback(*engine_, *edit_)) {
            return commandResultToJson(
                makeError(command, "audio_device_unavailable", *error));
          }
        }

        const EngineEventEmitter emitEvent = [this](const std::string& eventName,
                                                    const std::string& eventPayload) {
          if (eventCallback_) {
            eventCallback_(eventName, eventPayload);
          }
        };

        if (command == "start_pattern_preview") {
          const auto result = handleStartPatternPreview(
              *engine_,
              *edit_,
              projectState_,
              payloadJson,
              emitEvent,
              [this](EngineTask task) { messageThread_.post(std::move(task)); });
          return commandResultToJson(result);
        }

        if (command == "update_pattern_preview") {
          const auto result = handleUpdatePatternPreview(payloadJson);
          return commandResultToJson(result);
        }

        const auto result = handleStopPatternPreview();
        return commandResultToJson(result);
      }

      if (command == "midi_all_notes_off") {
        if (isMidiPhrasePreviewActive()) {
          handleStopMidiPhrasePreview();
        }
        const auto result = handleMidiAllNotesOff(*edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "start_midi_phrase_preview" || command == "stop_midi_phrase_preview") {
        if (command == "start_midi_phrase_preview") {
          if (isDrumPatternPreviewActive()) {
            handleStopPatternPreview();
          }
          if (const auto error = playbackRouting_.prepareForAudiblePlayback(*engine_, *edit_)) {
            return commandResultToJson(
                makeError(command, "audio_device_unavailable", *error));
          }
          const auto result = handleStartMidiPhrasePreview(*edit_, projectState_, payloadJson);
          return commandResultToJson(result);
        }
        const auto result = handleStopMidiPhrasePreview();
        return commandResultToJson(result);
      }

      if (command == "list_instrument_presets") {
        const auto result = handleListInstrumentPresets(payloadJson);
        return commandResultToJson(result);
      }

      if (command == "set_track_preset") {
        const auto result = handleSetTrackPreset(*edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "set_track_instrument_param") {
        const auto result = handleSetTrackInstrumentParam(*edit_, projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "set_record_arm") {
        const auto result = handleSetRecordArm(projectState_, payloadJson);
        return commandResultToJson(result);
      }

      if (command == "start_recording" || command == "stop_recording") {
        const EngineEventEmitter emitEvent = [this](const std::string& eventName, const std::string& eventPayload) {
          if (eventCallback_) {
            eventCallback_(eventName, eventPayload);
          }
        };

        if (command == "start_recording") {
          const auto result = handleStartRecording(*edit_, projectState_, payloadJson, emitEvent);
          return commandResultToJson(result);
        }

        const auto result = handleStopRecording(*edit_, projectState_, payloadJson, emitEvent);
        return commandResultToJson(result);
      }

      if (command == "start_audio_recording" || command == "stop_audio_recording") {
        const EngineEventEmitter emitEvent = [this](const std::string& eventName, const std::string& eventPayload) {
          if (eventCallback_) {
            eventCallback_(eventName, eventPayload);
          }
        };

        if (command == "start_audio_recording") {
          const auto result = handleStartAudioRecording(*engine_, projectState_, payloadJson, emitEvent);
          return commandResultToJson(result);
        }

        const auto result = handleStopAudioRecording(*engine_, *edit_, projectState_, payloadJson, emitEvent);
        return commandResultToJson(result);
      }

      if (command == "render_spectrogram") {
        const EngineEventEmitter emitEvent = [this](const std::string& eventName,
                                                    const std::string& eventPayload) {
          if (eventCallback_) {
            eventCallback_(eventName, eventPayload);
          }
        };
        const auto result = handleRenderSpectrogram(projectState_, payloadJson, emitEvent);
        return commandResultToJson(result);
      }

      return commandResultToJson(
          makeError(command, "unknown_command", "No handler registered for command."));
    });
  }

  void setEventCallback(EngineEventCallback callback) {
    eventCallback_ = std::move(callback);
    if (eventPublisher_) {
      eventPublisher_->setCallback(eventCallback_);
    }
  }

  EngineTransportSnapshot readTransportSnapshot() const {
    EngineTransportSnapshot snapshot;
    if (!edit_) {
      return snapshot;
    }

    auto& transport = edit_->getTransport();
    snapshot.isPlaying = transport.isPlaying();
    snapshot.positionSeconds = transport.getPosition().inSeconds();
    snapshot.positionBeat = readTransportBeat(*edit_);
    if (!edit_->tempoSequence.getTempos().isEmpty()) {
      snapshot.bpm = edit_->tempoSequence.getTempos()[0]->getBpm();
    }
    snapshot.clickTrackEnabled = edit_->clickTrackEnabled.get();
    return snapshot;
  }

  void setOwner(AudioEngineController* owner) { owner_ = owner; }

 private:
  AudioEngineController* owner_ = nullptr;
  JuceMessageThread messageThread_;
  std::unique_ptr<te::Engine> engine_;
  std::unique_ptr<te::Edit> edit_;
  std::unique_ptr<EngineEventPublisher> eventPublisher_;
  EngineEventCallback eventCallback_;
  bool initialized_ = false;
  ProjectState projectState_;
  MeterSnapshotReader meterSnapshotReader_;
  std::vector<nlohmann::json> uiTracks_;
  PlaybackDeviceRouting playbackRouting_;
  MixdownRenderManager mixdownRenderManager_;
  bool nativeTrackGraphReady_ = false;
  NativeTrackOutputRoutingSummary lastNativeRouting_;
  NativeTrackSidechainRoutingSummary lastNativeSidechain_;
  struct CountInClickTrackState {
    bool muted = false;
    bool solo = false;
  };
  struct CountInClickState {
    bool active = false;
    bool clickEnabled = false;
    bool clickRecordingOnly = false;
    double restoreBeat = 0.0;
    double recordStartBeat = 0.0;
    std::vector<CountInClickTrackState> tracks;
  };
  CountInClickState countInClickState_;

  void createDefaultEdit() {
    edit_ = std::make_unique<te::Edit>(*engine_, te::Edit::forEditing);
    edit_->playInStopEnabled = true;
    nativeTrackGraphReady_ = false;
    lastNativeRouting_ = {};
    lastNativeSidechain_ = {};
    configureClickTrack(true);
    edit_->ensureNumberOfAudioTracks(2);
    // Output-only — mic uses a separate device manager when recording.
    refreshPlaybackDevice(std::nullopt, true, true, false);
  }

  void configureClickTrack(bool enabled) {
    if (!edit_) {
      return;
    }
    edit_->clickTrackEnabled = enabled;
    edit_->clickTrackRecordingOnly = false;
    edit_->clickTrackEmphasiseBars = true;
    edit_->setClickTrackVolume(0.6f);
  }

  std::optional<std::string> refreshPlaybackDevice(
      std::optional<std::string> requestedOutputDeviceName,
      bool useSystemDefault,
      bool forceReopen,
      bool restoreStereoPlayback) {
    if (!engine_) {
      return std::string("Audio engine is not available.");
    }

    const auto error = playbackRouting_.refreshAudioDevice(
        *engine_,
        std::move(requestedOutputDeviceName),
        useSystemDefault,
        forceReopen,
        restoreStereoPlayback);
    if (!error && edit_ != nullptr) {
      playbackRouting_.syncWaveDevicesThenRebuild(*engine_, *edit_);
    }
    return error;
  }

  void appendTransportStatus(nlohmann::json& data) const {
    if (!edit_) {
      return;
    }
    const auto snapshot = readTransportSnapshot();
    data["isPlaying"] = snapshot.isPlaying;
    data["positionSeconds"] = snapshot.positionSeconds;
    data["positionBeat"] = snapshot.positionBeat;
    data["bpm"] = snapshot.bpm;
    data["clickTrackEnabled"] = snapshot.clickTrackEnabled;
  }

  std::string statusJson(bool includeDeviceLists = true) {
    nlohmann::json data;
    data["engineInitialized"] = initialized_;
    data["hasEdit"] = edit_ != nullptr;

    if (engine_) {
      auto& deviceManager = engine_->getDeviceManager();
      data["sampleRate"] = deviceManager.getSampleRate();
      data["blockSize"] = deviceManager.getBlockSize();
      auto* currentDevice = deviceManager.deviceManager.getCurrentAudioDevice();
      data["deviceName"] = currentDevice ? currentDevice->getName().toStdString() : "unavailable";
      if (includeDeviceLists) {
        data["availableSampleRates"] = currentDevice != nullptr
            ? numericArrayJson(currentDevice->getAvailableSampleRates())
            : nlohmann::json::array();
        data["availableBufferSizes"] = currentDevice != nullptr
            ? numericArrayJson(currentDevice->getAvailableBufferSizes())
            : nlohmann::json::array();
      }
      data["inputLatencySamples"] = currentDevice != nullptr
          ? currentDevice->getInputLatencyInSamples()
          : 0;
      data["outputLatencySamples"] = currentDevice != nullptr
          ? currentDevice->getOutputLatencyInSamples()
          : 0;
      const double sampleRate = deviceManager.getSampleRate();
      data["inputLatencyMs"] = sampleRate > 0.0
          ? (data["inputLatencySamples"].get<int>() * 1000.0) / sampleRate
          : 0.0;
      data["outputLatencyMs"] = sampleRate > 0.0
          ? (data["outputLatencySamples"].get<int>() * 1000.0) / sampleRate
          : 0.0;
    }
    data["preferredOutputDeviceName"] = playbackRouting_.preferredOutputDeviceName();
    data["preferredInputDeviceName"] = preferredAudioInputDeviceName();
    data["currentInputDeviceName"] = currentAudioInputDeviceName();
    if (includeDeviceLists) {
      data["availableOutputDevices"] = engine_ != nullptr
          ? playbackRouting_.listAudioDeviceOutputs(*engine_)
          : nlohmann::json::array();
      data["availableInputDevices"] = listAudioInputDevices();
    }

    appendTransportStatus(data);
    if (edit_) {
      if (auto masterVolume = edit_->getMasterVolumePlugin()) {
        data["masterVolumeDb"] = masterVolume->getVolumeDb();
        data["masterPan"] = masterVolume->getPan();
      }
    }

    data["uiTrackCount"] = uiTracks_.size();
    int mutedTracks = 0;
    int soloTracks = 0;
    for (const auto& track : uiTracks_) {
      if (track.value("isMuted", false)) {
        ++mutedTracks;
      }
      if (track.value("isSolo", false)) {
        ++soloTracks;
      }
    }
    data["uiMutedTrackCount"] = mutedTracks;
    data["uiSoloTrackCount"] = soloTracks;

    return data.dump();
  }

  std::string handleSetTransportPosition(const std::string& payloadJson) {
    nlohmann::json payload = payloadJson.empty() ? nlohmann::json::object()
                                                 : nlohmann::json::parse(payloadJson, nullptr, false);
    if (payload.is_discarded()
        || (!payload.contains("positionSeconds") && !payload.contains("positionBeat"))) {
      return commandResultToJson(makeError(
          "set_transport_position",
          "invalid_payload",
          "Expected payload { \"positionSeconds\" or \"positionBeat\": number }."));
    }

    auto& transport = edit_->getTransport();
    transport.stop(false, false);
    if (payload.contains("positionBeat")) {
      setTransportPositionBeats(*edit_, payload["positionBeat"].get<double>());
    } else {
      transport.setPosition(
          tracktion::TimePosition::fromSeconds(payload["positionSeconds"].get<double>()));
    }
    applyTrackMixState(*edit_, projectState_, readTransportBeat(*edit_));
    return commandResultToJson(makeSuccess("set_transport_position", statusJson()));
  }

  std::string handleTransportPlay(const std::string& payloadJson) {
    nlohmann::json payload = payloadJson.empty() ? nlohmann::json::object()
                                                 : nlohmann::json::parse(payloadJson, nullptr, false);
    const bool shouldPlay = payload.value("isPlaying", true);
    if (shouldPlay) {
      if (const auto error = playbackRouting_.prepareForAudiblePlayback(*engine_, *edit_)) {
        return commandResultToJson(makeError("transport_play", "audio_device_unavailable", *error));
      }
    }
    auto& transport = edit_->getTransport();

    if (shouldPlay) {
      handleStopPatternPreview();
      handleStopMidiPhrasePreview();
      clearAllPreviewClips(*edit_, projectState_);
      if (payload.contains("positionBeat")) {
        setTransportPositionBeats(*edit_, payload["positionBeat"].get<double>());
      } else if (payload.contains("positionSeconds")) {
        transport.setPosition(
            tracktion::TimePosition::fromSeconds(payload["positionSeconds"].get<double>()));
      }
      applyTrackMixState(*edit_, projectState_, readTransportBeat(*edit_));
      playbackRouting_.rebuildPlaybackGraph(*engine_, *edit_);
      transport.play(false);
    } else {
      transport.stop(false, false);
      handleStopPatternPreview();
      handleStopMidiPhrasePreview();
      if (payload.contains("positionSeconds")) {
        transport.setPosition(
            tracktion::TimePosition::fromSeconds(payload["positionSeconds"].get<double>()));
      }
      applyTrackMixState(*edit_, projectState_, readTransportBeat(*edit_));
    }

    return commandResultToJson(makeSuccess("transport_play", statusJson()));
  }

  std::string handleTransportStop() {
    edit_->getTransport().stop(false, false);
    applyTrackMixState(*edit_, projectState_, readTransportBeat(*edit_));
    return commandResultToJson(makeSuccess("transport_stop", statusJson()));
  }

  std::string handleReturnToZero() {
    auto& transport = edit_->getTransport();
    transport.stop(false, false);
    transport.setPosition(tracktion::TimePosition::fromSeconds(0.0));
    applyTrackMixState(*edit_, projectState_, readTransportBeat(*edit_));
    return commandResultToJson(makeSuccess("return_to_zero", statusJson()));
  }

  std::string handleSetBpm(const std::string& payloadJson) {
    nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
    if (payload.is_discarded() || !payload.contains("bpm")) {
      return commandResultToJson(
          makeError("set_bpm", "invalid_payload", "Expected payload { \"bpm\": number }."));
    }

    const double bpm = payload["bpm"].get<double>();
    if (!edit_->tempoSequence.getTempos().isEmpty()) {
      edit_->tempoSequence.getTempos()[0]->setBpm(bpm);
    }

    return commandResultToJson(makeSuccess("set_bpm", statusJson()));
  }

  std::string handleSetClickTrack(const std::string& payloadJson) {
    nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
    if (payload.is_discarded() || !payload.contains("enabled") || !payload["enabled"].is_boolean()) {
      return commandResultToJson(
          makeError("set_click_track", "invalid_payload", "Expected payload { \"enabled\": boolean }."));
    }

    configureClickTrack(payload["enabled"].get<bool>());
    return commandResultToJson(makeSuccess("set_click_track", statusJson()));
  }

  std::string handleStartCountInClick(const std::string& payloadJson) {
    nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
    if (payload.is_discarded() || !payload.contains("beats") || !payload["beats"].is_number()) {
      return commandResultToJson(
          makeError("start_count_in_click", "invalid_payload", "Expected payload { \"beats\": number }."));
    }

    if (const auto error = playbackRouting_.prepareForAudiblePlayback(*engine_, *edit_)) {
      return commandResultToJson(makeError("start_count_in_click", "audio_device_unavailable", *error));
    }

    if (countInClickState_.active) {
      restoreCountInClickState(std::nullopt);
    }

    auto& transport = edit_->getTransport();
    const double beats = std::max(0.0, payload["beats"].get<double>());
    const double recordStartBeat = std::max(
        0.0,
        jsonFiniteNumberOr(payload, "recordStartBeat", readTransportBeat(*edit_)));
    const double leadInBeat = std::max(0.0, recordStartBeat - beats);
    countInClickState_.active = true;
    countInClickState_.restoreBeat = readTransportBeat(*edit_);
    countInClickState_.recordStartBeat = recordStartBeat;
    countInClickState_.clickEnabled = edit_->clickTrackEnabled.get();
    countInClickState_.clickRecordingOnly = edit_->clickTrackRecordingOnly.get();
    countInClickState_.tracks.clear();
    const auto tracks = te::getAudioTracks(*edit_);
    for (auto* track : tracks) {
      if (track == nullptr) {
        continue;
      }
      countInClickState_.tracks.push_back({
          track->isMuted(false),
          track->isSolo(false),
      });
      track->setMute(true);
      track->setSolo(false);
    }

    edit_->clickTrackEnabled = true;
    edit_->clickTrackRecordingOnly = false;
    edit_->clickTrackEmphasiseBars = true;
    edit_->setClickTrackVolume(0.6f);
    handleStopPatternPreview();
    clearAllPreviewClips(*edit_, projectState_);
    setTransportPositionBeats(*edit_, leadInBeat);
    playbackRouting_.rebuildPlaybackGraph(*engine_, *edit_);
    transport.play(false);

    nlohmann::json data = nlohmann::json::parse(statusJson());
    data["countInClickActive"] = true;
    data["countInBeats"] = beats;
    data["recordStartBeat"] = recordStartBeat;
    data["nativeLeadInBeat"] = leadInBeat;
    return commandResultToJson(makeSuccess("start_count_in_click", data.dump()));
  }

  std::string handleStopCountInClick(const std::string& payloadJson) {
    std::optional<double> restoreBeat;
    nlohmann::json payload = payloadJson.empty() ? nlohmann::json::object()
                                                 : nlohmann::json::parse(payloadJson, nullptr, false);
    if (!payload.is_discarded() && payload.contains("restoreBeat") && payload["restoreBeat"].is_number()) {
      restoreBeat = std::max(0.0, payload["restoreBeat"].get<double>());
    }
    restoreCountInClickState(restoreBeat);
    nlohmann::json data = nlohmann::json::parse(statusJson());
    data["countInClickActive"] = false;
    return commandResultToJson(makeSuccess("stop_count_in_click", data.dump()));
  }

  void restoreCountInClickState(std::optional<double> requestedRestoreBeat) {
    if (!edit_) {
      return;
    }

    auto& transport = edit_->getTransport();
    transport.stop(false, false);
    if (countInClickState_.active) {
      const double restoreBeat = requestedRestoreBeat.value_or(countInClickState_.recordStartBeat);
      setTransportPositionBeats(*edit_, restoreBeat);
      edit_->clickTrackEnabled = countInClickState_.clickEnabled;
      edit_->clickTrackRecordingOnly = countInClickState_.clickRecordingOnly;
      const auto tracks = te::getAudioTracks(*edit_);
      for (int index = 0; index < tracks.size(); ++index) {
        if (index >= static_cast<int>(countInClickState_.tracks.size()) || tracks[index] == nullptr) {
          continue;
        }
        tracks[index]->setMute(countInClickState_.tracks[static_cast<std::size_t>(index)].muted);
        tracks[index]->setSolo(countInClickState_.tracks[static_cast<std::size_t>(index)].solo);
      }
      countInClickState_ = {};
    }
  }

  std::string handleSetTracks(const std::string& payloadJson) {
    nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
    if (payload.is_discarded() || !payload.contains("tracks") || !payload["tracks"].is_array()) {
      return commandResultToJson(makeError(
          "setTracks",
          "invalid_payload",
          "Expected payload { \"tracks\": [{ \"id\": string, \"name\": string, \"isMuted\": boolean, \"isSolo\": boolean }] }."));
    }

    uiTracks_.clear();
    std::vector<UiTrackRecord> trackRecords;
    for (const auto& track : payload["tracks"]) {
      if (!track.is_object()) {
        continue;
      }

      nlohmann::json normalizedTrack;
      normalizedTrack["id"] = track.value("id", "");
      normalizedTrack["name"] = track.value("name", "");
      normalizedTrack["isMuted"] = track.value("isMuted", false);
      normalizedTrack["isSolo"] = track.value("isSolo", false);
      normalizedTrack["type"] = track.value("type", "instrument");
      normalizedTrack["instrumentId"] = track.value("instrumentId", "");
      normalizedTrack["presetId"] = track.value("presetId", "");
      normalizedTrack["isRecordArmed"] = track.value("isRecordArmed", false);
      normalizedTrack["isInputMonitoringEnabled"] =
          normalizedTrack["type"].get<std::string>() == "voice_audio" &&
          track.value("isInputMonitoringEnabled", false);
      normalizedTrack["isFrozen"] = track.value("isFrozen", false);
      normalizedTrack["trackFolderName"] = jsonStringOr(track, "trackFolderName", {});
      normalizedTrack["trackGroupName"] = jsonStringOr(track, "trackGroupName", {});
      const auto routingRole = jsonStringOr(track, "routingRole", "track");
      normalizedTrack["routingRole"] =
          routingRole == "bus" || routingRole == "aux_return"
              ? routingRole
              : std::string{"track"};
      const auto automationMode = track.value("automationMode", std::string{"read"});
      normalizedTrack["automationMode"] =
          automationMode == "write" || automationMode == "touch" || automationMode == "latch"
              ? automationMode
              : std::string{"read"};
      normalizedTrack["automationLaneCount"] =
          track.contains("automationLanes") && track["automationLanes"].is_array()
              ? static_cast<int>(track["automationLanes"].size())
              : 0;
      normalizedTrack["volumeDb"] = std::clamp(
          jsonFiniteNumberOr(track, "volumeDb", 0.0),
          -60.0,
          6.0);
      normalizedTrack["pan"] = std::clamp(jsonFiniteNumberOr(track, "pan", 0.0), -1.0, 1.0);
      normalizedTrack["gainDb"] = std::clamp(
          jsonFiniteNumberOr(track, "gainDb", 0.0),
          -24.0,
          24.0);
      normalizedTrack["effectiveVolumeDb"] = std::clamp(
          jsonFiniteNumberOr(
              track,
              "effectiveVolumeDb",
              normalizedTrack["volumeDb"].get<double>() + normalizedTrack["gainDb"].get<double>()),
          -60.0,
          12.0);
      const auto routingOutputIt = track.find("routingOutputTrackId");
      const auto routingOutput =
          routingOutputIt != track.end() && routingOutputIt->is_string()
              ? routingOutputIt->get<std::string>()
              : std::string{"master"};
      normalizedTrack["routingOutputTrackId"] =
          routingOutput.empty() ? std::string{"master"} : routingOutput;
      normalizedTrack["routingSidechainSourceTrackId"] =
          jsonStringOr(track, "routingSidechainSourceTrackId", {});
      nlohmann::json routingSends = nlohmann::json::array();
      if (track.contains("routingSends") && track["routingSends"].is_array()) {
        for (const auto& send : track["routingSends"]) {
          if (!send.is_object()) {
            continue;
          }

          const auto targetIt = send.find("targetTrackId");
          if (targetIt == send.end() || !targetIt->is_string()) {
            continue;
          }
          const auto targetTrackId = targetIt->get<std::string>();
          if (targetTrackId.empty()) {
            continue;
          }

          const auto preFaderIt = send.find("preFader");
          const bool preFader =
              preFaderIt != send.end() && preFaderIt->is_boolean()
                  ? preFaderIt->get<bool>()
                  : false;
          routingSends.push_back({
              {"targetTrackId", targetTrackId},
              {"gainDb", std::clamp(jsonFiniteNumberOr(send, "gainDb", 0.0), -60.0, 6.0)},
              {"preFader", preFader},
          });
        }
      }
      normalizedTrack["routingSends"] = routingSends;
      normalizedTrack["routingSendCount"] = static_cast<int>(routingSends.size());
      uiTracks_.push_back(normalizedTrack);

      UiTrackRecord record;
      record.id = normalizedTrack["id"].get<std::string>();
      record.name = normalizedTrack["name"].get<std::string>();
      record.isMuted = normalizedTrack["isMuted"].get<bool>();
      record.isSolo = normalizedTrack["isSolo"].get<bool>();
      record.type = normalizedTrack["type"].get<std::string>();
      record.instrumentId = normalizedTrack["instrumentId"].get<std::string>();
      record.presetId = normalizedTrack["presetId"].get<std::string>();
      record.isRecordArmed = normalizedTrack["isRecordArmed"].get<bool>();
      record.isInputMonitoringEnabled = normalizedTrack["isInputMonitoringEnabled"].get<bool>();
      record.isFrozen = normalizedTrack["isFrozen"].get<bool>();
      record.trackFolderName = normalizedTrack["trackFolderName"].get<std::string>();
      record.trackGroupName = normalizedTrack["trackGroupName"].get<std::string>();
      record.routingRole = normalizedTrack["routingRole"].get<std::string>();
      record.automationMode = normalizedTrack["automationMode"].get<std::string>();
      record.automationLanes = parseAutomationLanes(track);
      record.automationLaneCount = static_cast<int>(record.automationLanes.size());
      record.volumeDb = normalizedTrack["volumeDb"].get<double>();
      record.pan = normalizedTrack["pan"].get<double>();
      record.gainDb = normalizedTrack["gainDb"].get<double>();
      record.effectiveVolumeDb = normalizedTrack["effectiveVolumeDb"].get<double>();
      record.routingOutputTrackId = normalizedTrack["routingOutputTrackId"].get<std::string>();
      record.routingSidechainSourceTrackId =
          normalizedTrack["routingSidechainSourceTrackId"].get<std::string>();
      for (const auto& send : normalizedTrack["routingSends"]) {
        UiTrackRoutingSend routingSend;
        routingSend.targetTrackId = send["targetTrackId"].get<std::string>();
        routingSend.gainDb = send["gainDb"].get<double>();
        routingSend.preFader = send["preFader"].get<bool>();
        record.routingSends.push_back(std::move(routingSend));
      }
      trackRecords.push_back(std::move(record));
    }

    const bool shouldRebuildTrackGraph =
        !nativeTrackGraphReady_ ||
        trackGraphTopologyChanged(projectState_.uiTracks(), trackRecords);

    projectState_.updateUiTracks(trackRecords);
    for (const auto& record : trackRecords) {
      if (!record.presetId.empty()) {
        projectState_.setTrackPreset(record.id, record.presetId);
      }
      projectState_.setTrackRecordArmed(record.id, record.isRecordArmed);
    }

    if (shouldRebuildTrackGraph) {
      const auto requiredTrackCount = static_cast<int>(std::max<std::size_t>(1, uiTracks_.size()));
      edit_->ensureNumberOfAudioTracks(requiredTrackCount);
      const auto ampResult = reconcileManagedAmpSim(*edit_, projectState_, "setTracks");
      if (!ampResult.ok) {
        return commandResultToJson(ampResult);
      }
      const auto fxResult = reconcileManagedTrackFx(*edit_, projectState_, "setTracks");
      if (!fxResult.ok) {
        return commandResultToJson(fxResult);
      }
    }
    applyTrackMixState(*edit_, projectState_, readTransportBeat(*edit_));
    if (shouldRebuildTrackGraph) {
      lastNativeRouting_ = applyNativeTrackOutputRouting(*edit_, projectState_);
      lastNativeSidechain_ = applyNativeTrackSidechainRouting(*edit_, projectState_);
      playbackRouting_.rebuildPlaybackGraph(*engine_, *edit_);
      nativeTrackGraphReady_ = true;
    }

    nlohmann::json data = nlohmann::json::parse(statusJson());
    data["tracks"] = uiTracks_;
    data["nativeRouting"] = {
        {"directOutputCount", lastNativeRouting_.directOutputCount},
        {"defaultOutputCount", lastNativeRouting_.defaultOutputCount},
        {"skippedOutputCount", lastNativeRouting_.skippedOutputCount},
        {"auxSendCount", lastNativeRouting_.auxSendCount},
        {"auxReturnCount", lastNativeRouting_.auxReturnCount},
        {"skippedAuxSendCount", lastNativeRouting_.skippedAuxSendCount},
        {"skippedAuxReturnCount", lastNativeRouting_.skippedAuxReturnCount},
        {"sidechainRequestCount", lastNativeSidechain_.requestedTrackCount},
        {"sidechainAppliedTrackCount", lastNativeSidechain_.appliedTrackCount},
        {"sidechainAppliedPluginCount", lastNativeSidechain_.appliedPluginCount},
        {"skippedSidechainCount", lastNativeSidechain_.skippedTrackCount},
    };
    return commandResultToJson(makeSuccess("setTracks", data.dump()));
  }

  std::string handleSetMasterMix(const std::string& payloadJson) {
    nlohmann::json payload = payloadJson.empty() ? nlohmann::json::object()
                                                 : nlohmann::json::parse(payloadJson, nullptr, false);
    if (payload.is_discarded()) {
      return commandResultToJson(makeError(
          "set_master_mix",
          "invalid_payload",
          "Expected payload { \"volumeDb\": number, \"pan\": number }."));
    }

    auto masterVolume = edit_->getMasterVolumePlugin();
    if (masterVolume == nullptr) {
      return commandResultToJson(makeError(
          "set_master_mix",
          "master_volume_unavailable",
          "The edit has no master volume plugin."));
    }

    const auto volumeDb = static_cast<float>(
        std::clamp(jsonFiniteNumberOr(payload, "volumeDb", 0.0), -60.0, 6.0));
    const auto pan = static_cast<float>(
        std::clamp(jsonFiniteNumberOr(payload, "pan", 0.0), -1.0, 1.0));
    masterVolume->setVolumeDb(volumeDb);
    masterVolume->setPan(pan);
    return commandResultToJson(makeSuccess("set_master_mix", statusJson()));
  }

  std::string handleRefreshAudioDevice(const std::string& payloadJson) {
    nlohmann::json payload = payloadJson.empty() ? nlohmann::json::object()
                                                 : nlohmann::json::parse(payloadJson, nullptr, false);
    const bool useSystemDefault = payload.value("useSystemDefault", false);
    const bool forceReopen = payload.value("forceReopen", true);
    const bool restoreStereoPlayback = payload.value("restoreStereoPlayback", false);
    const std::string outputDeviceName = payload.value("outputDeviceName", std::string{});

    const std::optional<std::string> requestedOutput =
        outputDeviceName.empty() ? std::nullopt : std::optional<std::string>{outputDeviceName};
    if (const auto error = refreshPlaybackDevice(
            requestedOutput,
            outputDeviceName.empty() && useSystemDefault,
            forceReopen,
            restoreStereoPlayback)) {
      return commandResultToJson(
          makeError("refresh_audio_device", "audio_device_unavailable", *error));
    }

    return commandResultToJson(makeSuccess("refresh_audio_device", statusJson()));
  }

  std::string handleSetOutputDevice(const std::string& payloadJson) {
    nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
    if (payload.is_discarded() || !payload.contains("name") || !payload["name"].is_string()) {
      return commandResultToJson(makeError(
          "set_output_device",
          "invalid_payload",
          "Expected payload { \"name\": string }."));
    }

    const auto requestedName = payload["name"].get<std::string>();
    if (const auto error = refreshPlaybackDevice(requestedName, false, true, false)) {
      return commandResultToJson(
          makeError("set_output_device", "audio_device_unavailable", *error));
    }

    return commandResultToJson(makeSuccess("set_output_device", statusJson()));
  }

  std::string handleSetInputDevice(const std::string& payloadJson) {
    const auto result = handleSetAudioInputDevice(payloadJson);
    if (!result.ok) {
      return commandResultToJson(result);
    }

    nlohmann::json data = nlohmann::json::parse(statusJson());
    data["inputs"] = listAudioInputDevices();
    return commandResultToJson(makeSuccess("set_input_device", data.dump()));
  }

  std::string handleSetAudioDeviceSettings(const std::string& payloadJson) {
    nlohmann::json payload = payloadJson.empty() ? nlohmann::json::object()
                                                 : nlohmann::json::parse(payloadJson, nullptr, false);
    if (payload.is_discarded()) {
      return commandResultToJson(makeError(
          "set_audio_device_settings",
          "invalid_payload",
          "Expected payload { \"sampleRate\"?: number, \"bufferSize\"?: number }."));
    }
    if (!engine_) {
      return commandResultToJson(makeError(
          "set_audio_device_settings",
          "engine_unavailable",
          "Audio engine is not available."));
    }

    auto& deviceManager = engine_->getDeviceManager().deviceManager;
    auto setup = deviceManager.getAudioDeviceSetup();
    const bool hasSampleRate = payload.contains("sampleRate") && payload["sampleRate"].is_number();
    const bool hasBufferSize = payload.contains("bufferSize") && payload["bufferSize"].is_number_integer();
    if (!hasSampleRate && !hasBufferSize) {
      return commandResultToJson(makeError(
          "set_audio_device_settings",
          "invalid_payload",
          "Expected sampleRate or bufferSize."));
    }

    if (hasSampleRate) {
      const double sampleRate = payload["sampleRate"].get<double>();
      if (!std::isfinite(sampleRate) || sampleRate <= 0.0) {
        return commandResultToJson(makeError(
            "set_audio_device_settings",
            "invalid_payload",
            "sampleRate must be a positive finite number."));
      }
      setup.sampleRate = sampleRate;
    }

    if (hasBufferSize) {
      const int bufferSize = payload["bufferSize"].get<int>();
      if (bufferSize <= 0) {
        return commandResultToJson(makeError(
            "set_audio_device_settings",
            "invalid_payload",
            "bufferSize must be a positive integer."));
      }
      setup.bufferSize = bufferSize;
    }

    const juce::String error = deviceManager.setAudioDeviceSetup(setup, true);
    if (error.isNotEmpty()) {
      return commandResultToJson(makeError(
          "set_audio_device_settings",
          "audio_device_unavailable",
          error.toStdString()));
    }

    if (edit_ != nullptr) {
      playbackRouting_.syncWaveDevicesThenRebuild(*engine_, *edit_);
    }
    return commandResultToJson(makeSuccess("set_audio_device_settings", statusJson()));
  }

  std::string handleRenderMixdown(const std::string& payloadJson) {
    nlohmann::json payload = payloadJson.empty() ? nlohmann::json::object()
                                                 : nlohmann::json::parse(payloadJson, nullptr, false);
    if (payload.is_discarded() || !payload.contains("path") || !payload["path"].is_string()) {
      return commandResultToJson(makeError(
          "render_mixdown",
          "invalid_payload",
          "Expected payload { \"path\": string, \"startBeat\"?: number, \"endBeat\"?: number }."));
    }
    if (!edit_) {
      return commandResultToJson(makeError(
          "render_mixdown",
          "edit_unavailable",
          "No edit is available to render."));
    }

    std::optional<tracktion::TimeRange> renderRange;
    std::optional<double> tailBeats;
    if (payload.contains("tailBeats")) {
      if (!payload["tailBeats"].is_number()) {
        return commandResultToJson(makeError(
            "render_mixdown",
            "invalid_payload",
            "tailBeats must be a non-negative finite number when provided."));
      }
      const double value = jsonFiniteNumberOr(payload, "tailBeats", -1.0);
      if (value < 0.0) {
        return commandResultToJson(makeError(
            "render_mixdown",
            "invalid_payload",
            "tailBeats must be a non-negative finite number when provided."));
      }
      tailBeats = value;
    }

    const bool hasStartBeat = payload.contains("startBeat");
    const bool hasEndBeat = payload.contains("endBeat");
    if (hasStartBeat || hasEndBeat) {
      if (!hasStartBeat || !hasEndBeat || !payload["startBeat"].is_number() ||
          !payload["endBeat"].is_number()) {
        return commandResultToJson(makeError(
            "render_mixdown",
            "invalid_payload",
            "Range render expects numeric startBeat and endBeat values."));
      }

      const double startBeat = jsonFiniteNumberOr(payload, "startBeat", 0.0);
      const double endBeat = jsonFiniteNumberOr(payload, "endBeat", 0.0);
      if (startBeat < 0.0 || endBeat <= startBeat) {
        return commandResultToJson(makeError(
            "render_mixdown",
            "invalid_payload",
            "Range render requires endBeat to be greater than startBeat."));
      }
      renderRange = beatRangeToTimeRange(
          *edit_,
          startBeat,
          (endBeat - startBeat) + tailBeats.value_or(0.0));
    }

    const bool hasTrackId = payload.contains("trackId");
    if (hasTrackId && !payload["trackId"].is_string()) {
      return commandResultToJson(makeError(
          "render_mixdown",
          "invalid_payload",
          "trackId must be a string when provided."));
    }

    juce::BigInteger tracksToRender = te::toBitSet(te::getAllTracks(*edit_));
    std::optional<std::string> renderTrackId;
    if (hasTrackId) {
      renderTrackId = payload["trackId"].get<std::string>();
      auto* stemTrack = trackForId(*edit_, projectState_, *renderTrackId);
      if (stemTrack == nullptr) {
        return commandResultToJson(makeError(
            "render_mixdown",
            "track_not_found",
            "Track ID is not mapped."));
      }

      const auto allTracks = te::getAllTracks(*edit_);
      int trackBit = -1;
      for (int index = 0; index < allTracks.size(); ++index) {
        if (allTracks[index] == stemTrack) {
          trackBit = index;
          break;
        }
      }
      if (trackBit < 0) {
        return commandResultToJson(makeError(
            "render_mixdown",
            "track_not_found",
            "Track ID is not renderable."));
      }

      tracksToRender.clear();
      tracksToRender.setBit(trackBit);
    }

    const juce::File targetFile(payload["path"].get<std::string>());
    if (targetFile.getFullPathName().isEmpty() || targetFile.isDirectory()) {
      return commandResultToJson(makeError(
          "render_mixdown",
          "invalid_payload",
          "Render path must be a writable file path."));
    }
    if (!targetFile.getParentDirectory().createDirectory()) {
      return commandResultToJson(makeError(
          "render_mixdown",
          "render_failed",
          "Could not create the render destination folder."));
    }
    if (targetFile.existsAsFile()) {
      targetFile.deleteFile();
    }

    const bool needsTargetedRender = renderRange.has_value() || renderTrackId.has_value();
    const auto effectiveRenderRange = renderRange.value_or(tracktion::TimeRange{
        tracktion::TimePosition::fromSeconds(0.0),
        edit_->getLength(),
    });
    const bool rendered = needsTargetedRender
        ? te::Renderer::renderToFile(
              "Render Mixdown",
              targetFile,
              *edit_,
              effectiveRenderRange,
              tracksToRender,
              true,
              true,
              {},
              false)
        : te::Renderer::renderToFile(*edit_, targetFile, false);
    if (!rendered || !targetFile.existsAsFile() || targetFile.getSize() <= 0) {
      return commandResultToJson(makeError(
          "render_mixdown",
          "render_failed",
          "Tracktion did not produce a mixdown file."));
    }

    nlohmann::json data;
    data["path"] = targetFile.getFullPathName().toStdString();
    data["fileBytes"] = static_cast<double>(targetFile.getSize());
    data["format"] = "wav";
    if (renderRange.has_value()) {
      data["startBeat"] = jsonFiniteNumberOr(payload, "startBeat", 0.0);
      data["endBeat"] = jsonFiniteNumberOr(payload, "endBeat", 0.0);
      data["tailBeats"] = tailBeats.value_or(0.0);
    }
    if (renderTrackId.has_value()) {
      data["trackId"] = *renderTrackId;
    }
    return commandResultToJson(makeSuccess("render_mixdown", data.dump()));
  }

  std::string handleListAudioDevices() {
    nlohmann::json data;
    data["outputs"] = playbackRouting_.listAudioDeviceOutputs(*engine_);
    data["inputs"] = listAudioInputDevices();
    data["preferredOutputDeviceName"] = playbackRouting_.preferredOutputDeviceName();
    data["preferredInputDeviceName"] = preferredAudioInputDeviceName();
    data["currentInputDeviceName"] = currentAudioInputDeviceName();
    return commandResultToJson(makeSuccess("list_audio_devices", data.dump()));
  }

};

AudioEngineController::AudioEngineController() : impl_(std::make_unique<Impl>()) {
  impl_->setOwner(this);
}

AudioEngineController::~AudioEngineController() {
  impl_->shutdown();
}

std::string AudioEngineController::initialize() {
  return impl_->initialize();
}

std::string AudioEngineController::shutdown() {
  return impl_->shutdown();
}

std::string AudioEngineController::getStatusJson() const {
  return impl_->getStatusJson();
}

std::string AudioEngineController::getTransportStatusJson() const {
  return impl_->getTransportStatusJson();
}

std::string AudioEngineController::getMeterSnapshotJson() const {
  return const_cast<Impl*>(impl_.get())->getMeterSnapshotJson();
}

std::string AudioEngineController::dispatchCommand(
    const std::string& command,
    const std::string& payloadJson) {
  return impl_->dispatchOnMessageThread(command, payloadJson);
}

void AudioEngineController::setEventCallback(EngineEventCallback callback) {
  impl_->setEventCallback(std::move(callback));
}

}  // namespace musicapp
