#include "SpectrogramCommands.h"

#include "JsonResponse.h"
#include "SpectrogramRenderer.h"

#include <juce_core/juce_core.h>
#include <nlohmann/json.hpp>

#include <mutex>
#include <thread>
#include <unordered_set>

namespace musicapp {

namespace {

std::mutex g_inFlightMutex;
std::unordered_set<std::string> g_inFlightRequestIds;

bool isSafeRecordedWavPath(const std::string& relativePath) {
  if (relativePath.empty() || relativePath[0] == '/' || relativePath[0] == '\\') {
    return false;
  }
  if (relativePath.find("..") != std::string::npos) {
    return false;
  }
  constexpr const char* kPrefix = "recordings/";
  if (relativePath.rfind(kPrefix, 0) != 0) {
    return false;
  }
  if (relativePath.size() < std::strlen(kPrefix) + 5) {
    return false;
  }
  return relativePath.size() >= 4
         && relativePath.compare(relativePath.size() - 4, 4, ".wav") == 0;
}

std::string pngPathForRecording(const std::string& audioPath) {
  const std::string clipId = audioPath.substr(std::strlen("recordings/"),
                                              audioPath.size() - std::strlen("recordings/") - 4);
  return std::string("spectrograms/") + clipId + ".png";
}

bool isUnderWritableRecordings(const ProjectState& projectState, const juce::File& absoluteFile) {
  const auto& writableRoot = projectState.writableAssetRoot();
  if (writableRoot.empty()) {
    return false;
  }
  juce::File recordingsDir(juce::String(writableRoot).replaceCharacter('\\', '/'));
  recordingsDir = recordingsDir.getChildFile("recordings");
  return absoluteFile.isAChildOf(recordingsDir) || absoluteFile == recordingsDir;
}

void emitSpectrogramReady(
    const EngineEventEmitter& emitEvent,
    const std::string& requestId,
    bool ok,
    const std::string& pngPath,
    const std::string& absolutePngPath,
    const std::string& errorMessage) {
  if (!emitEvent) {
    return;
  }

  nlohmann::json payload;
  payload["requestId"] = requestId;
  payload["pngPath"] = pngPath;
  payload["absolutePngPath"] = absolutePngPath;
  payload["ok"] = ok;
  if (!ok && !errorMessage.empty()) {
    payload["error"] = errorMessage;
  }
  emitEvent("onSpectrogramReady", payload.dump());
}

void clearInFlight(const std::string& requestId) {
  std::lock_guard<std::mutex> lock(g_inFlightMutex);
  g_inFlightRequestIds.erase(requestId);
}

}  // namespace

CommandResult handleRenderSpectrogram(
    ProjectState& projectState,
    const std::string& payloadJson,
    const EngineEventEmitter& emitEvent) {
  nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded()) {
    return makeError("render_spectrogram", "invalid_payload", "Payload must be valid JSON.");
  }

  const auto requestId = payload.value("requestId", std::string{});
  const auto audioPath = payload.value("audioPath", std::string{});
  const auto source = payload.value("source", std::string{});
  const int width = payload.value("width", 512);
  const int height = payload.value("height", 256);

  if (requestId.empty()) {
    return makeError("render_spectrogram", "invalid_payload", "requestId is required.");
  }
  if (source != "recorded_wav") {
    return makeError(
        "render_spectrogram",
        "invalid_payload",
        "Only source \"recorded_wav\" is supported in Phase 1.");
  }
  if (!isSafeRecordedWavPath(audioPath)) {
    return makeError(
        "render_spectrogram",
        "invalid_payload",
        "audioPath must be a relative recordings/*.wav path.");
  }
  if (width < 64 || width > 2048 || height < 64 || height > 2048) {
    return makeError(
        "render_spectrogram",
        "invalid_payload",
        "width and height must be integers between 64 and 2048.");
  }

  const std::string absoluteAudioPath = projectState.resolveAssetPath(audioPath);
  const juce::File audioFile(absoluteAudioPath);
  if (!audioFile.existsAsFile() || audioFile.getSize() <= 64) {
    return makeError("render_spectrogram", "audio_not_found", "Recorded WAV file was not found.");
  }
  if (!isUnderWritableRecordings(projectState, audioFile)) {
    return makeError(
        "render_spectrogram",
        "invalid_payload",
        "audioPath must resolve under the writable recordings directory.");
  }

  {
    std::lock_guard<std::mutex> lock(g_inFlightMutex);
    if (g_inFlightRequestIds.count(requestId) > 0) {
      return makeError(
          "render_spectrogram",
          "request_in_flight",
          "A spectrogram render with this requestId is already running.");
    }
    g_inFlightRequestIds.insert(requestId);
  }

  const std::string relativePngPath = pngPathForRecording(audioPath);
  const std::string absolutePngPath = projectState.resolveAssetPath(relativePngPath);
  const juce::File pngFile(absolutePngPath);

  std::thread([emitEvent,
               requestId,
               audioFile,
               pngFile,
               relativePngPath,
               absolutePngPath,
               width,
               height]() {
    std::string error;
    const bool ok = renderMelSpectrogramPng(audioFile, pngFile, width, height, error);
    emitSpectrogramReady(
        emitEvent,
        requestId,
        ok,
        ok ? relativePngPath : std::string{},
        ok ? absolutePngPath : std::string{},
        error);
    clearInFlight(requestId);
  }).detach();

  nlohmann::json data;
  data["requestId"] = requestId;
  data["status"] = "started";
  return makeSuccess("render_spectrogram", data.dump());
}

}  // namespace musicapp
