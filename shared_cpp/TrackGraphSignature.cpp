#include "TrackGraphSignature.h"

namespace musicapp {
namespace {

bool routingSendsEqual(
    const std::vector<UiTrackRoutingSend>& before,
    const std::vector<UiTrackRoutingSend>& after) {
  if (before.size() != after.size()) {
    return false;
  }

  for (std::size_t index = 0; index < before.size(); ++index) {
    const auto& left = before[index];
    const auto& right = after[index];
    if (left.targetTrackId != right.targetTrackId ||
        left.gainDb != right.gainDb ||
        left.preFader != right.preFader) {
      return false;
    }
  }
  return true;
}

bool graphRecordEqual(const UiTrackRecord& before, const UiTrackRecord& after) {
  return before.id == after.id &&
      before.name == after.name &&
      before.type == after.type &&
      before.instrumentId == after.instrumentId &&
      before.presetId == after.presetId &&
      before.isInputMonitoringEnabled == after.isInputMonitoringEnabled &&
      before.routingRole == after.routingRole &&
      before.routingOutputTrackId == after.routingOutputTrackId &&
      before.routingSidechainSourceTrackId == after.routingSidechainSourceTrackId &&
      routingSendsEqual(before.routingSends, after.routingSends);
}

}  // namespace

bool trackGraphTopologyChanged(
    const std::vector<UiTrackRecord>& before,
    const std::vector<UiTrackRecord>& after) {
  if (before.size() != after.size()) {
    return true;
  }

  for (std::size_t index = 0; index < before.size(); ++index) {
    if (!graphRecordEqual(before[index], after[index])) {
      return true;
    }
  }
  return false;
}

}  // namespace musicapp
