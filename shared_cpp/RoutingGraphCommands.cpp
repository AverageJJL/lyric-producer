#include "RoutingGraphCommands.h"

#include "JsonResponse.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <cctype>
#include <cmath>
#include <unordered_map>
#include <unordered_set>

namespace musicapp {

namespace {

constexpr const char* kCommand = "get_routing_graph";
constexpr const char* kMasterOutputId = "master";

std::string stringOr(const nlohmann::json& object, const char* key, std::string fallback = {}) {
  const auto it = object.find(key);
  return it != object.end() && it->is_string() ? it->get<std::string>() : fallback;
}

double numberOr(const nlohmann::json& object, const char* key, double fallback) {
  const auto it = object.find(key);
  if (it == object.end() || !it->is_number()) {
    return fallback;
  }
  const double value = it->get<double>();
  return std::isfinite(value) ? value : fallback;
}

std::string trim(const std::string& value) {
  const auto begin = std::find_if_not(value.begin(), value.end(), [](unsigned char item) {
    return std::isspace(item) != 0;
  });
  const auto end = std::find_if_not(value.rbegin(), value.rend(), [](unsigned char item) {
    return std::isspace(item) != 0;
  }).base();
  return begin < end ? std::string(begin, end) : std::string{};
}

bool isRoutingRole(const std::string& role) {
  return role == "track" || role == "bus" || role == "aux_return";
}

std::string rawOutputTarget(const UiTrackRecord& track) {
  const auto target = trim(track.routingOutputTrackId);
  return target.empty() ? std::string{kMasterOutputId} : target;
}

std::unordered_map<std::string, std::size_t> trackIndexesById(
    const std::vector<UiTrackRecord>& tracks) {
  std::unordered_map<std::string, std::size_t> indexes;
  for (std::size_t index = 0; index < tracks.size(); ++index) {
    if (!tracks[index].id.empty()) {
      indexes.emplace(tracks[index].id, index);
    }
  }
  return indexes;
}

bool outputCreatesCycle(
    const UiTrackRecord& track,
    const std::vector<UiTrackRecord>& tracks,
    const std::unordered_map<std::string, std::size_t>& byId,
    const std::string& targetTrackId) {
  std::unordered_set<std::string> seen;
  seen.insert(track.id);
  auto cursor = targetTrackId;

  while (cursor != kMasterOutputId) {
    if (seen.find(cursor) != seen.end()) {
      return true;
    }
    seen.insert(cursor);
    const auto next = byId.find(cursor);
    if (next == byId.end()) {
      return false;
    }
    cursor = rawOutputTarget(tracks[next->second]);
  }

  return false;
}

UiTrackRecord payloadTrackRecord(const nlohmann::json& track) {
  UiTrackRecord record;
  record.id = stringOr(track, "id");
  record.name = stringOr(track, "name", record.id);
  record.type = stringOr(track, "type");
  record.routingRole = stringOr(track, "routingRole", "track");
  record.routingOutputTrackId = stringOr(track, "routingOutputTrackId", kMasterOutputId);
  record.routingSidechainSourceTrackId = stringOr(track, "routingSidechainSourceTrackId");

  if (track.contains("routingSends") && track["routingSends"].is_array()) {
    for (const auto& sendJson : track["routingSends"]) {
      if (!sendJson.is_object()) {
        continue;
      }
      UiTrackRoutingSend send;
      send.targetTrackId = stringOr(sendJson, "targetTrackId");
      send.gainDb = std::clamp(numberOr(sendJson, "gainDb", 0.0), -60.0, 6.0);
      const auto preFaderIt = sendJson.find("preFader");
      send.preFader = preFaderIt != sendJson.end() &&
          preFaderIt->is_boolean() &&
          preFaderIt->get<bool>();
      record.routingSends.push_back(send);
    }
  }

  return record;
}

std::vector<UiTrackRecord> parsePayloadTracks(const nlohmann::json& tracksJson) {
  std::vector<UiTrackRecord> tracks;
  for (const auto& trackJson : tracksJson) {
    if (trackJson.is_object()) {
      tracks.push_back(payloadTrackRecord(trackJson));
    }
  }
  return tracks;
}

void pushIssue(
    nlohmann::json& issues,
    const UiTrackRecord& track,
    const std::string& type,
    const std::string& targetTrackId = {},
    const std::string& routingRole = {}) {
  nlohmann::json issue = {{"trackId", track.id}, {"type", type}};
  if (!targetTrackId.empty()) {
    issue["targetTrackId"] = targetTrackId;
  }
  if (!routingRole.empty()) {
    issue["routingRole"] = routingRole;
  }
  issues.push_back(issue);
}

nlohmann::json validateRoutingGraph(const std::vector<UiTrackRecord>& tracks) {
  nlohmann::json issues = nlohmann::json::array();
  const auto byId = trackIndexesById(tracks);

  for (const auto& track : tracks) {
    const auto role = trim(track.routingRole);
    if (!role.empty() && !isRoutingRole(role)) {
      pushIssue(issues, track, "invalid-role", {}, role);
    }

    const auto outputTarget = rawOutputTarget(track);
    if (outputTarget != kMasterOutputId) {
      if (outputTarget == track.id) {
        pushIssue(issues, track, "self-output", outputTarget);
      } else if (byId.find(outputTarget) == byId.end()) {
        pushIssue(issues, track, "missing-output", outputTarget);
      } else if (outputCreatesCycle(track, tracks, byId, outputTarget)) {
        pushIssue(issues, track, "output-cycle", outputTarget);
      }
    }

    for (const auto& send : track.routingSends) {
      const auto targetTrackId = trim(send.targetTrackId);
      if (targetTrackId == track.id) {
        pushIssue(issues, track, "self-send", targetTrackId);
      } else if (targetTrackId.empty() || byId.find(targetTrackId) == byId.end()) {
        pushIssue(issues, track, "missing-send", targetTrackId);
      }
    }

    const auto sidechainSource = trim(track.routingSidechainSourceTrackId);
    if (sidechainSource.empty()) {
      continue;
    }
    if (sidechainSource == track.id) {
      pushIssue(issues, track, "self-sidechain", sidechainSource);
    } else if (byId.find(sidechainSource) == byId.end()) {
      pushIssue(issues, track, "missing-sidechain", sidechainSource);
    }
  }

  return issues;
}

nlohmann::json sendsJson(const UiTrackRecord& track) {
  nlohmann::json sends = nlohmann::json::array();
  for (const auto& send : track.routingSends) {
    sends.push_back({
        {"targetTrackId", trim(send.targetTrackId)},
        {"gainDb", send.gainDb},
        {"preFader", send.preFader},
    });
  }
  return sends;
}

nlohmann::json trackJson(
    const UiTrackRecord& track,
    const std::vector<UiTrackRecord>& tracks) {
  nlohmann::json outputReceives = nlohmann::json::array();
  nlohmann::json sendReceives = nlohmann::json::array();
  nlohmann::json sidechainConsumers = nlohmann::json::array();

  for (const auto& source : tracks) {
    if (source.id == track.id) {
      continue;
    }
    if (rawOutputTarget(source) == track.id) {
      outputReceives.push_back(source.id);
    }
    if (trim(source.routingSidechainSourceTrackId) == track.id) {
      sidechainConsumers.push_back(source.id);
    }
    for (const auto& send : source.routingSends) {
      if (trim(send.targetTrackId) == track.id) {
        sendReceives.push_back({
            {"trackId", source.id},
            {"gainDb", send.gainDb},
            {"preFader", send.preFader},
        });
      }
    }
  }

  return {
      {"id", track.id},
      {"name", track.name},
      {"type", track.type},
      {"routingRole", trim(track.routingRole).empty() ? "track" : trim(track.routingRole)},
      {"routingOutputTrackId", rawOutputTarget(track)},
      {"routingSendCount", static_cast<int>(track.routingSends.size())},
      {"routingSends", sendsJson(track)},
      {"routingSidechainSourceTrackId", trim(track.routingSidechainSourceTrackId)},
      {"outputReceivesFrom", outputReceives},
      {"sendReceivesFrom", sendReceives},
      {"sidechainConsumers", sidechainConsumers},
  };
}

nlohmann::json graphJson(
    const std::vector<UiTrackRecord>& tracks,
    const std::string& source) {
  nlohmann::json roleCounts = {
      {"track", 0},
      {"bus", 0},
      {"aux_return", 0},
      {"invalid", 0},
  };
  nlohmann::json trackItems = nlohmann::json::array();

  for (const auto& track : tracks) {
    const auto role = trim(track.routingRole);
    if (role.empty()) {
      roleCounts["track"] = roleCounts["track"].get<int>() + 1;
    } else if (isRoutingRole(role)) {
      roleCounts[role] = roleCounts[role].get<int>() + 1;
    } else {
      roleCounts["invalid"] = roleCounts["invalid"].get<int>() + 1;
    }
    trackItems.push_back(trackJson(track, tracks));
  }

  const auto issues = validateRoutingGraph(tracks);
  return {
      {"routingGraphVersion", 1},
      {"source", source},
      {"trackCount", static_cast<int>(tracks.size())},
      {"issueCount", static_cast<int>(issues.size())},
      {"hasRoutingIssues", !issues.empty()},
      {"roleCounts", roleCounts},
      {"issues", issues},
      {"tracks", trackItems},
  };
}

}  // namespace

CommandResult handleGetRoutingGraph(
    const ProjectState& projectState,
    const std::string& payloadJson) {
  const auto payload = payloadJson.empty()
      ? nlohmann::json::object()
      : nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.is_object()) {
    return makeError(kCommand, "invalid_payload", "Expected object payload.");
  }

  if (payload.contains("tracks")) {
    if (!payload["tracks"].is_array()) {
      return makeError(kCommand, "invalid_payload", "tracks must be an array.");
    }
    return makeSuccess(kCommand, graphJson(parsePayloadTracks(payload["tracks"]), "payload").dump());
  }

  return makeSuccess(kCommand, graphJson(projectState.uiTracks(), "project_state").dump());
}

}  // namespace musicapp
