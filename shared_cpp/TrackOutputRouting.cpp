#include "TrackOutputRouting.h"

#include <tracktion_engine/tracktion_engine.h>

#include <algorithm>
#include <cctype>
#include <string>
#include <unordered_map>
#include <unordered_set>

namespace musicapp {

namespace te = tracktion::engine;

namespace {

constexpr const char* kMasterOutputId = "master";

std::string trim(const std::string& value) {
  const auto begin = std::find_if_not(value.begin(), value.end(), [](unsigned char item) {
    return std::isspace(item) != 0;
  });
  const auto end = std::find_if_not(value.rbegin(), value.rend(), [](unsigned char item) {
    return std::isspace(item) != 0;
  }).base();
  return begin < end ? std::string(begin, end) : std::string{};
}

std::string outputTarget(const UiTrackRecord& track) {
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

struct AuxReturnTarget {
  int busNumber = 0;
  std::size_t trackIndex = 0;
};

std::unordered_map<std::string, AuxReturnTarget> auxReturnTargetsById(
    const std::vector<UiTrackRecord>& tracks) {
  std::unordered_map<std::string, AuxReturnTarget> targets;
  int busNumber = 0;
  for (std::size_t index = 0; index < tracks.size(); ++index) {
    if (trim(tracks[index].routingRole) != "aux_return" || tracks[index].id.empty()) {
      continue;
    }
    targets.emplace(tracks[index].id, AuxReturnTarget{busNumber, index});
    ++busNumber;
  }
  return targets;
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
    cursor = outputTarget(tracks[next->second]);
  }

  return false;
}

void clearManagedAuxPlugins(te::AudioTrack& track) {
  const auto plugins = track.pluginList.getPlugins();
  for (auto* plugin : plugins) {
    if (dynamic_cast<te::AuxSendPlugin*>(plugin) != nullptr ||
        dynamic_cast<te::AuxReturnPlugin*>(plugin) != nullptr) {
      plugin->deleteFromParent();
    }
  }
}

int auxSendInsertIndex(te::AudioTrack& track, bool preFader) {
  auto* volume = track.getVolumePlugin();
  const int volumeIndex = volume != nullptr ? track.pluginList.indexOf(volume) : -1;
  if (volumeIndex < 0) {
    return -1;
  }
  return preFader ? volumeIndex : volumeIndex + 1;
}

bool insertAuxReturn(te::Edit& edit, te::AudioTrack& track, int busNumber) {
  auto plugin = edit.getPluginCache().createNewPlugin(te::AuxReturnPlugin::xmlTypeName, {});
  auto* auxReturn = dynamic_cast<te::AuxReturnPlugin*>(plugin.get());
  if (auxReturn == nullptr) {
    return false;
  }
  auxReturn->busNumber.setValue(busNumber, nullptr);
  track.pluginList.insertPlugin(plugin, 0, nullptr);
  return true;
}

bool insertAuxSend(
    te::Edit& edit,
    te::AudioTrack& track,
    int busNumber,
    double gainDb,
    bool preFader) {
  auto plugin = edit.getPluginCache().createNewPlugin(te::AuxSendPlugin::xmlTypeName, {});
  auto* auxSend = dynamic_cast<te::AuxSendPlugin*>(plugin.get());
  if (auxSend == nullptr) {
    return false;
  }
  auxSend->busNumber.setValue(busNumber, nullptr);
  auxSend->setGainDb(static_cast<float>(gainDb));
  track.pluginList.insertPlugin(plugin, auxSendInsertIndex(track, preFader), nullptr);
  return true;
}

}  // namespace

NativeTrackOutputRoutingSummary applyNativeTrackOutputRouting(
    te::Edit& edit,
    const ProjectState& projectState) {
  NativeTrackOutputRoutingSummary summary;
  const auto nativeTracks = te::getAudioTracks(edit);
  const auto& tracks = projectState.uiTracks();
  const auto byId = trackIndexesById(tracks);
  const auto auxTargets = auxReturnTargetsById(tracks);

  for (auto* nativeTrack : nativeTracks) {
    if (nativeTrack != nullptr) {
      // The UI routing model is authoritative for now, so the native aux graph is
      // rebuilt from that state just like managed instruments and effects.
      clearManagedAuxPlugins(*nativeTrack);
    }
  }

  for (std::size_t index = 0; index < tracks.size(); ++index) {
    if (index >= static_cast<std::size_t>(nativeTracks.size()) || nativeTracks[static_cast<int>(index)] == nullptr) {
      ++summary.skippedOutputCount;
      continue;
    }
    nativeTracks[static_cast<int>(index)]->getOutput().setOutputToDefaultDevice(false);
    ++summary.defaultOutputCount;
  }

  for (const auto& item : auxTargets) {
    const auto& target = item.second;
    if (target.trackIndex >= static_cast<std::size_t>(nativeTracks.size()) ||
        nativeTracks[static_cast<int>(target.trackIndex)] == nullptr) {
      ++summary.skippedAuxReturnCount;
      continue;
    }

    const auto& track = tracks[target.trackIndex];
    edit.setAuxBusName(
        target.busNumber,
        juce::String(track.name.empty() ? track.id : track.name));
    if (insertAuxReturn(
            edit,
            *nativeTracks[static_cast<int>(target.trackIndex)],
            target.busNumber)) {
      ++summary.auxReturnCount;
    } else {
      ++summary.skippedAuxReturnCount;
    }
  }

  for (std::size_t index = 0; index < tracks.size(); ++index) {
    if (index >= static_cast<std::size_t>(nativeTracks.size()) || nativeTracks[static_cast<int>(index)] == nullptr) {
      summary.skippedAuxSendCount += static_cast<int>(tracks[index].routingSends.size());
      continue;
    }

    for (const auto& send : tracks[index].routingSends) {
      const auto target = auxTargets.find(trim(send.targetTrackId));
      if (target == auxTargets.end() ||
          target->second.trackIndex == index ||
          target->second.trackIndex >= static_cast<std::size_t>(nativeTracks.size()) ||
          nativeTracks[static_cast<int>(target->second.trackIndex)] == nullptr) {
        ++summary.skippedAuxSendCount;
        continue;
      }
      if (!insertAuxSend(
              edit,
              *nativeTracks[static_cast<int>(index)],
              target->second.busNumber,
              send.gainDb,
              send.preFader)) {
        ++summary.skippedAuxSendCount;
        continue;
      }
      ++summary.auxSendCount;
    }
  }

  for (std::size_t index = 0; index < tracks.size(); ++index) {
    const auto& track = tracks[index];
    const auto targetTrackId = outputTarget(track);
    if (targetTrackId == kMasterOutputId) {
      continue;
    }
    const auto target = byId.find(targetTrackId);
    const bool invalidTarget = targetTrackId == track.id ||
        target == byId.end() ||
        outputCreatesCycle(track, tracks, byId, targetTrackId) ||
        index >= static_cast<std::size_t>(nativeTracks.size()) ||
        target->second >= static_cast<std::size_t>(nativeTracks.size()) ||
        nativeTracks[static_cast<int>(index)] == nullptr ||
        nativeTracks[static_cast<int>(target->second)] == nullptr;
    if (invalidTarget) {
      ++summary.skippedOutputCount;
      continue;
    }

    nativeTracks[static_cast<int>(index)]->getOutput().setOutputToTrack(
        nativeTracks[static_cast<int>(target->second)]);
    ++summary.directOutputCount;
  }

  return summary;
}

}  // namespace musicapp
