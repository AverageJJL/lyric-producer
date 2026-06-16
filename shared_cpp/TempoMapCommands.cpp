#include "TempoMapCommands.h"

#include "JsonResponse.h"

#include <algorithm>
#include <cmath>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>

#include <tracktion_engine/tracktion_engine.h>

namespace te = tracktion::engine;

namespace musicapp {

namespace {

struct TempoEvent {
  double beat = 0.0;
  double bpm = 120.0;
  std::string ramp = "jump";
};

struct MeterEvent {
  double beat = 0.0;
  int numerator = 4;
  int denominator = 4;
};

bool isAllowedDenominator(int value) {
  return value == 2 || value == 4 || value == 8 || value == 16;
}

double normalizedBeat(double value) {
  return std::round(std::max(0.0, value) * 1000.0) / 1000.0;
}

double normalizedBpm(double value) {
  if (!std::isfinite(value)) {
    return 120.0;
  }
  return std::clamp(std::round(value), te::TempoSetting::minBPM, te::TempoSetting::maxBPM);
}

int normalizedNumerator(int value) {
  switch (value) {
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 9:
    case 12:
      return value;
    default:
      return 4;
  }
}

int normalizedDenominator(int value) {
  return isAllowedDenominator(value) ? value : 4;
}

float curveForRamp(const std::string& ramp) {
  return ramp == "linear" ? 0.0f : 1.0f;
}

std::string rampForCurve(float curve) {
  return std::abs(curve) < 0.0001f ? "linear" : "jump";
}

std::string eventId(const std::string& prefix, double beat) {
  const int whole = static_cast<int>(std::floor(beat));
  const int millis = static_cast<int>(std::round((beat - whole) * 1000.0));
  return prefix + "-" + std::to_string(whole) + "_" + std::to_string(1000 + millis).substr(1);
}

std::string timeSignatureString(int numerator, int denominator) {
  return std::to_string(numerator) + "/" + std::to_string(denominator);
}

std::vector<TempoEvent> parseTempoEvents(const nlohmann::json& payload, double fallbackBpm) {
  std::vector<TempoEvent> events{{0.0, normalizedBpm(fallbackBpm), "jump"}};
  if (!payload.contains("tempoMap") || !payload["tempoMap"].is_array()) {
    return events;
  }

  for (const auto& item : payload["tempoMap"]) {
    if (!item.is_object() || !item.contains("beat") || !item["beat"].is_number()
        || !item.contains("bpm") || !item["bpm"].is_number()) {
      continue;
    }
    TempoEvent event;
    event.beat = normalizedBeat(item["beat"].get<double>());
    event.bpm = normalizedBpm(item["bpm"].get<double>());
    event.ramp = item.value("ramp", "jump") == "linear" ? "linear" : "jump";
    events.push_back(event);
  }

  std::sort(events.begin(), events.end(), [](const auto& left, const auto& right) {
    return left.beat < right.beat;
  });

  std::vector<TempoEvent> collapsed;
  for (const auto& event : events) {
    if (!collapsed.empty() && std::abs(collapsed.back().beat - event.beat) < 0.0001) {
      collapsed.back() = event;
    } else {
      collapsed.push_back(event);
    }
  }
  return collapsed;
}

std::vector<MeterEvent> parseMeterEvents(const nlohmann::json& payload) {
  const auto rawBase = payload.value("timeSignature", nlohmann::json::object());
  const auto base = rawBase.is_object() ? rawBase : nlohmann::json::object();
  std::vector<MeterEvent> events{{
      0.0,
      normalizedNumerator(base.value("numerator", 4)),
      normalizedDenominator(base.value("denominator", 4)),
  }};
  if (!payload.contains("meterMap") || !payload["meterMap"].is_array()) {
    return events;
  }

  for (const auto& item : payload["meterMap"]) {
    if (!item.is_object() || !item.contains("beat") || !item["beat"].is_number()
        || !item.contains("timeSignature") || !item["timeSignature"].is_object()) {
      continue;
    }
    const auto sig = item["timeSignature"];
    events.push_back({
        normalizedBeat(item["beat"].get<double>()),
        normalizedNumerator(sig.value("numerator", 4)),
        normalizedDenominator(sig.value("denominator", 4)),
    });
  }

  std::sort(events.begin(), events.end(), [](const auto& left, const auto& right) {
    return left.beat < right.beat;
  });

  std::vector<MeterEvent> collapsed;
  for (const auto& event : events) {
    if (!collapsed.empty() && std::abs(collapsed.back().beat - event.beat) < 0.0001) {
      collapsed.back() = event;
    } else {
      collapsed.push_back(event);
    }
  }
  return collapsed;
}

void clearMappedTempoSequence(te::TempoSequence& sequence) {
  for (int index = sequence.getNumTempos(); --index > 0;) {
    sequence.removeTempo(index, false);
  }
  for (int index = sequence.getNumTimeSigs(); --index > 0;) {
    sequence.removeTimeSig(index);
  }
}

nlohmann::json tempoSequenceJson(te::TempoSequence& sequence) {
  nlohmann::json data;
  data["tempoMap"] = nlohmann::json::array();
  data["meterMap"] = nlohmann::json::array();

  for (const auto* tempo : sequence.getTempos()) {
    if (tempo == nullptr) {
      continue;
    }
    const double beat = normalizedBeat(tempo->getStartBeat().inBeats());
    nlohmann::json event = {
        {"id", eventId("tempo", beat)},
        {"beat", beat},
        {"bpm", normalizedBpm(tempo->getBpm())},
        {"ramp", rampForCurve(tempo->getCurve())},
    };
    data["tempoMap"].push_back(event);
  }

  for (const auto* meter : sequence.getTimeSigs()) {
    if (meter == nullptr) {
      continue;
    }
    const double beat = normalizedBeat(meter->getStartBeat().inBeats());
    nlohmann::json event = {
        {"id", eventId("meter", beat)},
        {"beat", beat},
        {"timeSignature", {
            {"numerator", normalizedNumerator(meter->numerator.get())},
            {"denominator", normalizedDenominator(meter->denominator.get())},
        }},
    };
    data["meterMap"].push_back(event);
  }

  data["bpm"] = data["tempoMap"].empty() ? 120.0 : data["tempoMap"][0]["bpm"].get<double>();
  data["timeSignature"] = data["meterMap"].empty()
      ? nlohmann::json{{"numerator", 4}, {"denominator", 4}}
      : data["meterMap"][0]["timeSignature"];
  return data;
}

}  // namespace

CommandResult handleSetTempoMap(te::Edit& edit, const std::string& payloadJson) {
  const auto payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.is_object() || !payload.contains("bpm")
      || !payload["bpm"].is_number()) {
    return makeError("set_tempo_map", "invalid_payload",
                     "Expected payload { bpm, timeSignature, tempoMap, meterMap }.");
  }

  auto& sequence = edit.tempoSequence;
  const auto tempos = parseTempoEvents(payload, payload["bpm"].get<double>());
  const auto meters = parseMeterEvents(payload);
  clearMappedTempoSequence(sequence);

  if (auto* baseTempo = sequence.getTempo(0)) {
    baseTempo->setBpm(tempos.front().bpm);
    baseTempo->setCurve(curveForRamp(tempos.front().ramp));
  }
  if (auto* baseMeter = sequence.getTimeSig(0)) {
    baseMeter->setStringTimeSig(timeSignatureString(
        meters.front().numerator,
        meters.front().denominator));
  }

  for (std::size_t index = 1; index < tempos.size(); ++index) {
    const auto& event = tempos[index];
    if (auto tempo = sequence.insertTempo(
            tracktion::BeatPosition::fromBeats(event.beat),
            event.bpm,
            curveForRamp(event.ramp))) {
      tempo->setCurve(curveForRamp(event.ramp));
    }
  }

  for (std::size_t index = 1; index < meters.size(); ++index) {
    const auto& event = meters[index];
    if (auto meter = sequence.insertTimeSig(tracktion::BeatPosition::fromBeats(event.beat))) {
      meter->setStringTimeSig(timeSignatureString(event.numerator, event.denominator));
    }
  }

  return makeSuccess("set_tempo_map", tempoSequenceJson(sequence).dump());
}

CommandResult handleGetTempoMap(te::Edit& edit) {
  return makeSuccess("get_tempo_map", tempoSequenceJson(edit.tempoSequence).dump());
}

}  // namespace musicapp
