#include "AudioInputCapture.h"

#include "AudioInputDeviceManager.h"
#include "AudioInputRecordingResult.h"
#include "AudioInputCaptureWorker.h"
#include "InputMeterState.h"
#include "JsonResponse.h"
#include "TempoSequenceTime.h"

#include <atomic>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <nlohmann/json.hpp>

namespace te = tracktion::engine;

namespace musicapp {

namespace {

struct AudioCaptureSession {
  bool active = false;
  std::string trackId;
  std::string clipId;
  std::string inputDeviceName;
  double clipStartBeat = 0.0;
  juce::File targetFile;
};

std::unique_ptr<juce::AudioFormatWriter> g_writer;
std::atomic<juce::int64> g_samplesWritten{0};
AudioInputCaptureWorker g_captureWorker;
AudioCaptureSession g_audioSession;

class InputCaptureCallback : public juce::AudioIODeviceCallback {
 public:
  void begin() {
    recording.store(true, std::memory_order_release);
  }

  void end() {
    recording.store(false, std::memory_order_release);
  }

  void audioDeviceAboutToStart(juce::AudioIODevice* device) override {
    juce::ignoreUnused(device);
  }
  void audioDeviceStopped() override {}
  void audioDeviceIOCallbackWithContext(
      const float* const* inputChannelData,
      int numInputChannels,
      float* const* outputChannelData,
      int numOutputChannels,
      int numSamples,
      const juce::AudioIODeviceCallbackContext& context) override {
    juce::ignoreUnused(outputChannelData, numOutputChannels, context);

    if (!recording.load(std::memory_order_acquire) || inputChannelData == nullptr
        || numInputChannels <= 0) {
      return;
    }
    g_captureWorker.enqueue(inputChannelData, numInputChannels, numSamples);
  }
 private:
  std::atomic<bool> recording{false};
};
InputCaptureCallback g_captureCallback;

void teardownCaptureWriters() {
  g_captureCallback.end();
  // Flush and release the WAV writer before closing the mic so stop_audio_recording
  // can read a finalized file and upsert_audio_clip sees non-empty audio on disk.
  g_captureWorker.stop();
  g_samplesWritten.store(g_captureWorker.samplesWritten(), std::memory_order_relaxed);
  if (g_writer != nullptr) {
    g_writer->flush();
  }
  g_writer.reset();
  closeMicCaptureDevice(g_captureCallback, true);
}

}  // namespace

void releaseMicCaptureForPlayback() {
  if (g_audioSession.active || g_writer != nullptr) {
    teardownCaptureWriters();
    g_audioSession = {};
    return;
  }

  g_captureCallback.end();
  closeMicCaptureDevice(g_captureCallback, true);
}

bool isAudioCaptureSessionActive() {
  return g_audioSession.active || g_writer != nullptr;
}

std::string getMicCaptureInputDeviceNameForPlaybackConflict() {
  // After mic capture closes, do not block playback reopen to a BT speaker / headphones.
  if (!isAudioCaptureSessionActive() && g_writer == nullptr) {
    return {};
  }
  return lastMicInputDeviceName();
}

CommandResult handleStartAudioRecording(
    te::Engine& engine,
    ProjectState& projectState,
    const std::string& payloadJson,
    const EngineEventEmitter& emitEvent) {
  DBG("[AudioInputCapture] handleStartAudioRecording: entered");

  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("trackId") || !payload.contains("clipId")) {
    DBG("[AudioInputCapture] handleStartAudioRecording: invalid_payload");
    return makeError(
        "start_audio_recording",
        "invalid_payload",
        "Expected payload { trackId, clipId, startBeat? }.");
  }

  if (g_audioSession.active) {
    DBG("[AudioInputCapture] handleStartAudioRecording: tearing down previous session");
    teardownCaptureWriters();
    g_audioSession = {};
  }

  juce::ignoreUnused(engine);

  DBG("[AudioInputCapture] handleStartAudioRecording: opening dedicated mic device");
  g_captureCallback.end();
  if (!openMicCaptureDevice(g_captureCallback)) {
    DBG("[AudioInputCapture] handleStartAudioRecording: input_unavailable");
    return makeError(
        "start_audio_recording",
        "input_unavailable",
        "No audio input is active. Check mic privacy permission, then use Refresh Audio.");
  }

  auto& deviceManager = micCaptureDeviceManager();
  auto* device = deviceManager.getCurrentAudioDevice();
  if (device == nullptr || !device->isOpen()) {
    DBG("[AudioInputCapture] handleStartAudioRecording: device_unavailable (null or closed)");
    return makeError("start_audio_recording", "device_unavailable", "Audio device is not open.");
  }

  const int activeInputs = device->getActiveInputChannels().countNumberOfSetBits();
  DBG("[AudioInputCapture] handleStartAudioRecording: device=" + device->getName()
      + " activeInputs=" + juce::String(activeInputs)
      + " sampleRate=" + juce::String(device->getCurrentSampleRate()));

  if (activeInputs <= 0) {
    return makeError(
        "start_audio_recording",
        "input_unavailable",
        "No active input channels on the current audio device.");
  }

  const int numChannels = std::max(1, std::min(2, activeInputs));
  const double sampleRate = device->getCurrentSampleRate();
  if (sampleRate <= 0.0) {
    return makeError("start_audio_recording", "device_unavailable", "Invalid device sample rate.");
  }

  const auto clipId = payload["clipId"].get<std::string>();
  const auto relativePath = std::string("recordings/") + clipId + ".wav";
  const auto absolutePath = projectState.resolveAssetPath(relativePath);
  juce::File targetFile(absolutePath);
  if (!targetFile.getParentDirectory().createDirectory()) {
    return makeError(
        "start_audio_recording",
        "writer_failed",
        "Could not create recordings directory.");
  }

  g_samplesWritten.store(0, std::memory_order_relaxed);

  std::unique_ptr<juce::OutputStream> outputStream =
      std::make_unique<juce::FileOutputStream>(targetFile);
  auto* fileStream = dynamic_cast<juce::FileOutputStream*>(outputStream.get());
  if (fileStream == nullptr || !fileStream->openedOk()) {
    return makeError("start_audio_recording", "writer_failed", "Could not open output file for recording.");
  }

  juce::WavAudioFormat wavFormat;
  g_writer = wavFormat.createWriterFor(
      outputStream,
      juce::AudioFormatWriter::Options{}
          .withSampleRate(sampleRate)
          .withNumChannels(numChannels)
          .withBitsPerSample(16));

  if (g_writer == nullptr) {
    DBG("[AudioInputCapture] handleStartAudioRecording: writer_failed");
    return makeError("start_audio_recording", "writer_failed", "Could not create WAV writer.");
  }

  g_audioSession = {};
  g_audioSession.active = true;
  g_audioSession.trackId = payload["trackId"].get<std::string>();
  g_audioSession.clipId = clipId;
  g_audioSession.inputDeviceName = currentAudioInputDeviceName();
  markInputMeterInactive(g_audioSession.inputDeviceName);
  g_audioSession.clipStartBeat = payload.value("startBeat", 0.0);
  g_audioSession.targetFile = targetFile;

  DBG("[AudioInputCapture] handleStartAudioRecording: writer created, starting capture to "
      + juce::String(absolutePath));

  g_captureWorker.start({
      g_writer.get(),
      emitEvent,
      g_audioSession.trackId,
      g_audioSession.clipId,
      g_audioSession.inputDeviceName,
  });
  g_captureCallback.begin();
  deviceManager.addAudioCallback(&g_captureCallback);

  nlohmann::json data;
  data["trackId"] = g_audioSession.trackId;
  data["clipId"] = g_audioSession.clipId;
  data["audioFilePath"] = relativePath;
  data["absoluteAudioFilePath"] = absolutePath;
  data["inputDeviceName"] = g_audioSession.inputDeviceName;
  data["isRecording"] = true;

  if (emitEvent) {
    nlohmann::json eventPayload = data;
    eventPayload["event"] = "audioRecordingStarted";
    emitEvent("onRecordingUpdate", eventPayload.dump());
  }

  return makeSuccess("start_audio_recording", data.dump());
}

CommandResult handleStopAudioRecording(
    te::Engine& engine,
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson,
    const EngineEventEmitter& emitEvent) {
  juce::ignoreUnused(payloadJson);

  DBG("[AudioInputCapture] handleStopAudioRecording: entered, session.active="
      + juce::String(g_audioSession.active ? "true" : "false")
      + " clipId=" + juce::String(g_audioSession.clipId));

  const auto session = g_audioSession;
  const bool hadActiveCapture = session.active || g_writer != nullptr;
  const double nativeInputLatencyMs = currentMicInputLatencyMs();

  if (hadActiveCapture) {
    teardownCaptureWriters();
  }
  const auto samplesWritten = g_samplesWritten.load(std::memory_order_relaxed);
  markInputMeterInactive(session.inputDeviceName);
  g_audioSession = {};

  const auto recording = analyzeStoppedAudioRecording(session.targetFile, samplesWritten);

  const double lengthBeats =
      std::max(1.0, beatDurationForSecondsAtBeat(
                        edit.tempoSequence,
                        session.clipStartBeat,
                        recording.durationSeconds));

  nlohmann::json peakArray = nlohmann::json::array();
  for (float peak : recording.waveformPeaks) {
    peakArray.push_back(peak);
  }

  nlohmann::json data;
  data["trackId"] = session.trackId;
  data["clipId"] = session.clipId;
  data["audioFilePath"] = std::string("recordings/") + session.clipId + ".wav";
  data["absoluteAudioFilePath"] = projectState.resolveAssetPath(data["audioFilePath"].get<std::string>());
  data["inputDeviceName"] = session.inputDeviceName;
  data["lengthBeats"] = lengthBeats;
  data["durationSeconds"] = recording.durationSeconds;
  data["samplesWritten"] = samplesWritten;
  data["fileBytes"] = recording.fileBytes;
  data["peakAmplitude"] = recording.peakAmplitude;
  data["nativeInputLatencyMs"] = nativeInputLatencyMs;
  data["waveformPeaks"] = peakArray;
  data["isRecording"] = false;

  if (emitEvent) {
    nlohmann::json eventPayload = data;
    eventPayload["event"] = "audioRecordingStopped";
    emitEvent("onRecordingUpdate", eventPayload.dump());
  }

  return makeSuccess("stop_audio_recording", data.dump());
}

}  // namespace musicapp
