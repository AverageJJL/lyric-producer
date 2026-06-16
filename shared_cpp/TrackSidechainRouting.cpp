#include "TrackSidechainRouting.h"

#include <tracktion_engine/tracktion_engine.h>

#include <algorithm>
#include <cctype>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace musicapp {

namespace te = tracktion::engine;

namespace {

std::string trim(const std::string& value) {
  const auto begin = std::find_if_not(value.begin(), value.end(), [](unsigned char item) {
    return std::isspace(item) != 0;
  });
  const auto end = std::find_if_not(value.rbegin(), value.rend(), [](unsigned char item) {
    return std::isspace(item) != 0;
  }).base();
  return begin < end ? std::string(begin, end) : std::string{};
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

te::AudioTrack* nativeTrackAt(
    const juce::Array<te::AudioTrack*>& nativeTracks,
    std::size_t index) {
  return index < static_cast<std::size_t>(nativeTracks.size())
      ? nativeTracks[static_cast<int>(index)]
      : nullptr;
}

void clearPluginSidechain(te::Plugin& plugin) {
  std::vector<std::pair<int, int>> wires;
  for (int index = 0; index < plugin.getNumWires(); ++index) {
    if (auto* wire = plugin.getWire(index)) {
      wires.emplace_back(wire->sourceChannelIndex, wire->destChannelIndex);
    }
  }
  for (const auto& wire : wires) {
    plugin.breakConnection(wire.first, wire.second);
  }
  plugin.setSidechainSourceID(te::EditItemID{});
}

}  // namespace

NativeTrackSidechainRoutingSummary applyNativeTrackSidechainRouting(
    te::Edit& edit,
    const ProjectState& projectState) {
  NativeTrackSidechainRoutingSummary summary;
  const auto nativeTracks = te::getAudioTracks(edit);
  const auto& tracks = projectState.uiTracks();
  const auto byId = trackIndexesById(tracks);

  for (auto* nativeTrack : nativeTracks) {
    if (nativeTrack == nullptr) {
      continue;
    }
    for (auto* plugin : nativeTrack->pluginList) {
      if (plugin != nullptr) {
        // The UI track model is authoritative. Rebuilding keeps stale sidechain
        // sources from surviving track deletion, reorder, or plugin-chain changes.
        clearPluginSidechain(*plugin);
      }
    }
  }

  for (std::size_t index = 0; index < tracks.size(); ++index) {
    const auto sourceTrackId = trim(tracks[index].routingSidechainSourceTrackId);
    if (sourceTrackId.empty()) {
      continue;
    }

    ++summary.requestedTrackCount;
    const auto source = byId.find(sourceTrackId);
    auto* targetTrack = nativeTrackAt(nativeTracks, index);
    auto* sourceTrack = source != byId.end() ? nativeTrackAt(nativeTracks, source->second) : nullptr;
    if (sourceTrackId == tracks[index].id || source == byId.end() ||
        targetTrack == nullptr || sourceTrack == nullptr) {
      ++summary.skippedTrackCount;
      continue;
    }

    int appliedForTrack = 0;
    for (auto* plugin : targetTrack->pluginList) {
      if (plugin == nullptr || !plugin->canSidechain()) {
        continue;
      }
      plugin->setSidechainSourceID(sourceTrack->itemID);
      plugin->guessSidechainRouting();
      ++appliedForTrack;
      ++summary.appliedPluginCount;
    }

    if (appliedForTrack > 0) {
      ++summary.appliedTrackCount;
    } else {
      ++summary.skippedTrackCount;
    }
  }

  return summary;
}

}  // namespace musicapp
