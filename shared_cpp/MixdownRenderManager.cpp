#include "MixdownRenderManager.h"

#include "ArrangementCommandHelpers.h"
#include "JsonResponse.h"

#include <algorithm>
#include <cmath>
#include <nlohmann/json.hpp>
#include <optional>

namespace te = tracktion::engine;

namespace musicapp {
namespace {

constexpr const char* kRenderCommand = "render_mixdown_async";

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

std::string requestIdFromPayload(const nlohmann::json& payload) {
  return payload.contains("requestId") && payload["requestId"].is_string()
      ? payload["requestId"].get<std::string>()
      : std::string{};
}

CommandResult invalidPayload(const std::string& message) {
  return makeError(kRenderCommand, "invalid_payload", message);
}

}  // namespace

struct MixdownRenderManager::RenderState {
  std::string requestId;
  juce::File targetFile;
  std::optional<double> startBeat;
  std::optional<double> endBeat;
  double tailBeats = 0.0;
  std::optional<std::string> trackId;
  std::shared_ptr<te::EditRenderer::Handle> handle;

  mutable std::mutex mutex;
  bool finished = false;
  bool succeeded = false;
  bool canceled = false;
  std::string error;
};

std::shared_ptr<MixdownRenderManager::RenderState> MixdownRenderManager::findRender(
    const std::string& requestId) const {
  std::lock_guard<std::mutex> lock(mutex_);
  const auto it = std::find_if(renders_.begin(), renders_.end(), [&](const auto& state) {
    return state->requestId == requestId;
  });
  return it == renders_.end() ? nullptr : *it;
}

bool MixdownRenderManager::hasRunningRender() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return std::any_of(renders_.begin(), renders_.end(), [](const auto& state) {
    std::lock_guard<std::mutex> stateLock(state->mutex);
    return !state->finished;
  });
}

CommandResult MixdownRenderManager::start(
    te::Engine& engine,
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& payloadJson) {
  const auto payload = payloadJson.empty()
      ? nlohmann::json::object()
      : nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("path") || !payload["path"].is_string()) {
    return invalidPayload("Expected payload { \"requestId\": string, \"path\": string }.");
  }

  const auto requestId = requestIdFromPayload(payload);
  if (requestId.empty()) {
    return invalidPayload("requestId is required for async mixdown renders.");
  }
  if (findRender(requestId)) {
    return makeError(kRenderCommand, "duplicate_request", "Render requestId is already active.");
  }
  if (hasRunningRender()) {
    return makeError(kRenderCommand, "render_in_progress", "A mixdown render is already running.");
  }

  std::optional<tracktion::TimeRange> renderRange;
  double tailBeats = 0.0;
  if (payload.contains("tailBeats")) {
    if (!payload["tailBeats"].is_number()) {
      return invalidPayload("tailBeats must be a non-negative finite number when provided.");
    }
    tailBeats = jsonFiniteNumberOr(payload, "tailBeats", -1.0);
    if (tailBeats < 0.0) {
      return invalidPayload("tailBeats must be a non-negative finite number when provided.");
    }
  }

  const bool hasStartBeat = payload.contains("startBeat");
  const bool hasEndBeat = payload.contains("endBeat");
  std::optional<double> startBeatForStatus;
  std::optional<double> endBeatForStatus;
  if (hasStartBeat || hasEndBeat) {
    if (!hasStartBeat || !hasEndBeat || !payload["startBeat"].is_number() ||
        !payload["endBeat"].is_number()) {
      return invalidPayload("Range render expects numeric startBeat and endBeat values.");
    }
    const double startBeat = jsonFiniteNumberOr(payload, "startBeat", 0.0);
    const double endBeat = jsonFiniteNumberOr(payload, "endBeat", 0.0);
    if (startBeat < 0.0 || endBeat <= startBeat) {
      return invalidPayload("Range render requires endBeat to be greater than startBeat.");
    }
    startBeatForStatus = startBeat;
    endBeatForStatus = endBeat;
    renderRange = beatRangeToTimeRange(edit, startBeat, (endBeat - startBeat) + tailBeats);
  }

  juce::BigInteger tracksToRender = te::toBitSet(te::getAllTracks(edit));
  std::optional<std::string> renderTrackId;
  if (payload.contains("trackId")) {
    if (!payload["trackId"].is_string()) {
      return invalidPayload("trackId must be a string when provided.");
    }
    renderTrackId = payload["trackId"].get<std::string>();
    auto* stemTrack = trackForId(edit, projectState, *renderTrackId);
    if (stemTrack == nullptr) {
      return makeError(kRenderCommand, "track_not_found", "Track ID is not mapped.");
    }

    const auto allTracks = te::getAllTracks(edit);
    int trackBit = -1;
    for (int index = 0; index < allTracks.size(); ++index) {
      if (allTracks[index] == stemTrack) {
        trackBit = index;
        break;
      }
    }
    if (trackBit < 0) {
      return makeError(kRenderCommand, "track_not_found", "Track ID is not renderable.");
    }
    tracksToRender.clear();
    tracksToRender.setBit(trackBit);
  }

  const juce::File targetFile(payload["path"].get<std::string>());
  if (targetFile.getFullPathName().isEmpty() || targetFile.isDirectory()) {
    return invalidPayload("Render path must be a writable file path.");
  }
  if (!targetFile.getParentDirectory().createDirectory()) {
    return makeError(kRenderCommand, "render_failed", "Could not create the render destination folder.");
  }
  if (targetFile.existsAsFile()) {
    targetFile.deleteFile();
  }

  te::TransportControl::stopAllTransports(engine, false, true);
  te::Renderer::turnOffAllPlugins(edit);

  te::Renderer::Parameters params(edit);
  params.destFile = targetFile;
  params.audioFormat = engine.getAudioFileFormatManager().getDefaultFormat();
  params.bitDepth = 24;
  params.sampleRateForAudio = engine.getDeviceManager().getSampleRate();
  params.blockSizeForAudio = engine.getDeviceManager().getBlockSize();
  params.time = renderRange.value_or(tracktion::TimeRange{
      tracktion::TimePosition::fromSeconds(0.0),
      edit.getLength(),
  });
  params.usePlugins = true;
  params.useMasterPlugins = true;
  params.tracksToDo = tracksToRender;

  auto state = std::make_shared<RenderState>();
  state->requestId = requestId;
  state->targetFile = targetFile;
  state->startBeat = startBeatForStatus;
  state->endBeat = endBeatForStatus;
  state->tailBeats = tailBeats;
  state->trackId = renderTrackId;

  state->handle = te::EditRenderer::render(std::move(params), [state](auto result) {
    std::lock_guard<std::mutex> lock(state->mutex);
    state->finished = true;
    state->succeeded = static_cast<bool>(result);
    if (!state->succeeded) {
      state->error = result.error();
      state->canceled = state->error == "Cancelled";
      if (state->targetFile.existsAsFile()) {
        state->targetFile.deleteFile();
      }
    }
  });

  {
    std::lock_guard<std::mutex> lock(mutex_);
    renders_.push_back(state);
  }

  nlohmann::json data;
  data["requestId"] = requestId;
  data["status"] = "running";
  data["progress"] = 0.0;
  return makeSuccess(kRenderCommand, data.dump());
}

CommandResult MixdownRenderManager::cancel(const std::string& payloadJson) {
  const auto payload = payloadJson.empty()
      ? nlohmann::json::object()
      : nlohmann::json::parse(payloadJson, nullptr, false);
  const auto requestId = requestIdFromPayload(payload);
  if (payload.is_discarded() || requestId.empty()) {
    return makeError("cancel_render_mixdown", "invalid_payload", "requestId is required.");
  }

  auto state = findRender(requestId);
  if (!state) {
    return makeError("cancel_render_mixdown", "render_not_found", "Render request was not found.");
  }
  state->handle->cancel();

  nlohmann::json data;
  data["requestId"] = requestId;
  data["status"] = "canceling";
  return makeSuccess("cancel_render_mixdown", data.dump());
}

CommandResult MixdownRenderManager::status(const std::string& payloadJson) {
  const auto payload = payloadJson.empty()
      ? nlohmann::json::object()
      : nlohmann::json::parse(payloadJson, nullptr, false);
  const auto requestId = requestIdFromPayload(payload);
  if (payload.is_discarded() || requestId.empty()) {
    return makeError("get_render_mixdown_status", "invalid_payload", "requestId is required.");
  }

  auto state = findRender(requestId);
  if (!state) {
    return makeError("get_render_mixdown_status", "render_not_found", "Render request was not found.");
  }

  std::lock_guard<std::mutex> lock(state->mutex);
  nlohmann::json data;
  data["requestId"] = state->requestId;
  data["progress"] = state->handle ? state->handle->getProgress() : 0.0f;
  if (!state->finished) {
    data["status"] = "running";
    return makeSuccess("get_render_mixdown_status", data.dump());
  }

  data["status"] = state->canceled ? "canceled" : state->succeeded ? "completed" : "failed";
  data["path"] = state->targetFile.getFullPathName().toStdString();
  data["fileBytes"] = static_cast<double>(state->targetFile.getSize());
  data["format"] = "wav";
  if (state->startBeat.has_value() && state->endBeat.has_value()) {
    data["startBeat"] = *state->startBeat;
    data["endBeat"] = *state->endBeat;
    data["tailBeats"] = state->tailBeats;
  }
  if (state->trackId.has_value()) {
    data["trackId"] = *state->trackId;
  }
  if (!state->succeeded) {
    data["error"] = state->error.empty() ? "Mixdown render failed." : state->error;
  }
  return makeSuccess("get_render_mixdown_status", data.dump());
}

}  // namespace musicapp
