#include "TrackMixCommands.h"

#include "InstrumentCommands.h"
#include "JsonResponse.h"
#include "MusicAppAirwindowsFxPlugin.h"
#include "TrackAutomation.h"
#include "TrackRoutingIntrospection.h"

#include <nlohmann/json.hpp>
#include <tracktion_engine/tracktion_engine.h>

#include <algorithm>
#include <cmath>

namespace musicapp {

namespace te = tracktion::engine;

namespace {

constexpr float kFourOscFilterFreqRange = 135.076232f;
constexpr float kFourOscFilterResonanceRange = 100.0f;

double jsonFiniteNumberOr(const nlohmann::json& object, const char* key, double fallback) {
  const auto it = object.find(key);
  if (it == object.end() || !it->is_number()) {
    return fallback;
  }
  const double value = it->get<double>();
  return std::isfinite(value) ? value : fallback;
}

nlohmann::json automationLanesJson(const UiTrackRecord& track, double evaluationBeat) {
  nlohmann::json lanes = nlohmann::json::array();
  for (const auto& lane : track.automationLanes) {
    lanes.push_back({
        {"targetType", lane.targetType},
        {"parameterId", lane.parameterId},
        {"pointCount", static_cast<int>(lane.points.size())},
        {"evaluatedValue", evaluateAutomationLaneValue(lane, evaluationBeat, 0.0)},
    });
  }
  return lanes;
}

double nativeCurveUiValue(const std::string& parameterId, float value) {
  if (parameterId == "volumeDb") {
    return te::volumeFaderPositionToDB(value);
  }
  if (parameterId == "filter.cutoff") {
    return std::clamp(static_cast<double>(value / kFourOscFilterFreqRange), 0.0, 1.0);
  }
  if (parameterId == "filter.resonance") {
    return std::clamp(static_cast<double>(value / kFourOscFilterResonanceRange), 0.0, 1.0);
  }
  return value;
}

nlohmann::json nativeAutomationCurveJson(
    const te::Edit& edit,
    const std::string& parameterId,
    const te::AutomatableParameter* parameter) {
  if (parameter == nullptr) {
    return nullptr;
  }

  const auto& curve = parameter->getCurve();
  const int pointCount = curve.getNumPoints();
  if (pointCount <= 0) {
    return nullptr;
  }

  const auto first = curve.getPoint(0);
  const auto last = curve.getPoint(pointCount - 1);
  return {
      {"parameterId", parameterId},
      {"pointCount", pointCount},
      {"bypassed", static_cast<bool>(curve.bypass.get())},
      {"firstBeat", te::toBeats(first.time, edit.tempoSequence).inBeats()},
      {"firstValue", nativeCurveUiValue(parameterId, first.value)},
      {"lastBeat", te::toBeats(last.time, edit.tempoSequence).inBeats()},
      {"lastValue", nativeCurveUiValue(parameterId, last.value)},
  };
}

nlohmann::json nativeAutomationCurvesJson(const te::Edit& edit, te::AudioTrack* track) {
  nlohmann::json curves = nlohmann::json::array();
  if (track == nullptr) {
    return curves;
  }

  auto* volume = track->getVolumePlugin();
  if (volume == nullptr) {
    return curves;
  }

  auto volumeCurve = nativeAutomationCurveJson(edit, "volumeDb", volume->volParam.get());
  if (!volumeCurve.is_null()) {
    curves.push_back(volumeCurve);
  }

  auto panCurve = nativeAutomationCurveJson(edit, "pan", volume->panParam.get());
  if (!panCurve.is_null()) {
    curves.push_back(panCurve);
  }

  for (auto* plugin : track->pluginList) {
    auto* fx = dynamic_cast<MusicAppAirwindowsFxPlugin*>(plugin);
    if (fx == nullptr) {
      continue;
    }

    for (auto* parameter : fx->getAutomatableParameters()) {
      if (parameter == nullptr) {
        continue;
      }

      auto fxCurve = nativeAutomationCurveJson(
          edit,
          fx->slotId() + "." + parameter->paramID.toStdString(),
          parameter);
      if (!fxCurve.is_null()) {
        curves.push_back(fxCurve);
      }
    }
  }

  if (auto* fourOsc = findFourOscOnTrack(*track)) {
    auto cutoffCurve = nativeAutomationCurveJson(
        edit,
        "filter.cutoff",
        fourOsc->filterFreq.get());
    if (!cutoffCurve.is_null()) {
      curves.push_back(cutoffCurve);
    }
    auto resonanceCurve = nativeAutomationCurveJson(
        edit,
        "filter.resonance",
        fourOsc->filterResonance.get());
    if (!resonanceCurve.is_null()) {
      curves.push_back(resonanceCurve);
    }
  }

  return curves;
}

nlohmann::json trackMixRecordToJson(
    const te::Edit& edit,
    const UiTrackRecord& track,
    te::AudioTrack* nativeTrack,
    const std::string& nativeOutputTrackId,
    const nlohmann::json& nativeAuxSends,
    int nativeAuxReturnBusNumber,
    const nlohmann::json& nativeSidechainPlugins,
    double evaluationBeat) {
  const double nativeFaderDb = automationAppliedTrackVolumeDb(track, evaluationBeat);
  const double nativePan = automationAppliedTrackPan(track, evaluationBeat);
  const double nativeEffectiveDb = std::clamp(nativeFaderDb + track.gainDb, -60.0, 12.0);
  auto nativeCurves = nativeAutomationCurvesJson(edit, nativeTrack);
  const nlohmann::json channelStrip = {
      {"inputGainDb", track.gainDb},
      {"faderVolumeDb", nativeFaderDb},
      {"pan", nativePan},
      {"postFaderEffectiveDb", nativeEffectiveDb},
  };
  nlohmann::json routingSends = nlohmann::json::array();
  for (const auto& send : track.routingSends) {
    routingSends.push_back({
        {"targetTrackId", send.targetTrackId},
        {"gainDb", send.gainDb},
        {"preFader", send.preFader},
    });
  }

  return {
      {"id", track.id},
      {"name", track.name},
      {"type", track.type},
      {"isMuted", track.isMuted},
      {"isSolo", track.isSolo},
      {"isInputMonitoringEnabled", track.isInputMonitoringEnabled},
      {"isFrozen", track.isFrozen},
      {"trackFolderName", track.trackFolderName},
      {"trackGroupName", track.trackGroupName},
      {"automationMode", track.automationMode},
      {"automationReadActive", hasReadableTrackAutomation(track)},
      {"automationLaneCount", track.automationLaneCount},
      {"automationEvaluationBeat", evaluationBeat},
      {"automationLanes", automationLanesJson(track, evaluationBeat)},
      {"automationAppliedFaderDb", nativeFaderDb},
      {"automationAppliedPan", nativePan},
      {"nativeAutomationCurveCount", static_cast<int>(nativeCurves.size())},
      {"nativeAutomationCurves", nativeCurves},
      {"volumeDb", track.volumeDb},
      {"pan", track.pan},
      {"gainDb", track.gainDb},
      {"effectiveVolumeDb", track.effectiveVolumeDb},
      {"nativeGainTrimDb", track.gainDb},
      {"nativeFaderDb", nativeFaderDb},
      {"nativeEffectiveVolumeDb", nativeEffectiveDb},
      {"routingRole", track.routingRole},
      {"routingOutputTrackId", track.routingOutputTrackId},
      {"nativeRoutingOutputTrackId", nativeOutputTrackId},
      {"routingSendCount", static_cast<int>(track.routingSends.size())},
      {"routingSends", routingSends},
      {"nativeAuxSendCount", static_cast<int>(nativeAuxSends.size())},
      {"nativeAuxSends", nativeAuxSends},
      {"nativeAuxReturnBusNumber", nativeAuxReturnBusNumber},
      {"routingSidechainSourceTrackId", track.routingSidechainSourceTrackId},
      {"nativeSidechainPluginCount", static_cast<int>(nativeSidechainPlugins.size())},
      {"nativeSidechainPlugins", nativeSidechainPlugins},
      {"gainStageMode", "separate_gain_trim"},
      {"channelStrip", channelStrip},
  };
}

}  // namespace

CommandResult handleGetTrackMix(
    const te::Edit& edit,
    const ProjectState& projectState,
    double masterVolumeDb,
    double masterPan,
    double automationEvaluationBeat,
    const std::string& payloadJson) {
  const auto payload = payloadJson.empty()
      ? nlohmann::json::object()
      : nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.is_object()) {
    return makeError("get_track_mix", "invalid_payload", "Expected object payload.");
  }

  const bool hasTrackFilter = payload.contains("trackId");
  if (hasTrackFilter && !payload["trackId"].is_string()) {
    return makeError("get_track_mix", "invalid_payload", "trackId must be a string.");
  }
  const auto trackId = hasTrackFilter ? payload["trackId"].get<std::string>() : std::string{};
  const double evaluationBeat = std::max(
      0.0,
      jsonFiniteNumberOr(payload, "beat", automationEvaluationBeat));

  nlohmann::json tracks = nlohmann::json::array();
  const auto nativeTracks = te::getAudioTracks(edit);
  const auto& uiTracks = projectState.uiTracks();
  for (std::size_t index = 0; index < uiTracks.size(); ++index) {
    const auto& track = uiTracks[index];
    if (!trackId.empty() && track.id != trackId) {
      continue;
    }
    auto* nativeTrack = index < static_cast<std::size_t>(nativeTracks.size())
        ? nativeTracks[static_cast<int>(index)]
        : nullptr;
    tracks.push_back(trackMixRecordToJson(
        edit,
        track,
        nativeTrack,
        nativeRoutingOutputTrackId(projectState, nativeTracks, nativeTrack),
        nativeAuxSendsJson(projectState, nativeTrack),
        nativeAuxReturnBusNumber(nativeTrack),
        nativeSidechainPluginsJson(projectState, nativeTracks, nativeTrack),
        evaluationBeat));
  }

  if (hasTrackFilter && tracks.empty()) {
    return makeError("get_track_mix", "track_not_found", "Track ID is not mapped.");
  }

  return makeSuccess(
      "get_track_mix",
      nlohmann::json{
          {"channelStripVersion", 6},
          {"gainStageMode", "separate_gain_trim"},
          {"automationEvaluationBeat", evaluationBeat},
          {"tracks", tracks},
          {"master", {{"volumeDb", masterVolumeDb}, {"pan", masterPan}}},
      }.dump());
}

}  // namespace musicapp
