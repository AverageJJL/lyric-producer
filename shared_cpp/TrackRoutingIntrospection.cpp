#include "TrackRoutingIntrospection.h"

#include <algorithm>
#include <cctype>
#include <unordered_map>

namespace musicapp {

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

std::unordered_map<int, std::string> auxTargetsByBus(const ProjectState& projectState) {
  std::unordered_map<int, std::string> targets;
  int busNumber = 0;
  for (const auto& track : projectState.uiTracks()) {
    if (trim(track.routingRole) == "aux_return" && !track.id.empty()) {
      targets.emplace(busNumber, track.id);
      ++busNumber;
    }
  }
  return targets;
}

bool auxSendIsPreFader(te::AudioTrack& track, te::AuxSendPlugin* send) {
  auto* volume = track.getVolumePlugin();
  if (send == nullptr || volume == nullptr) {
    return false;
  }
  const int sendIndex = track.pluginList.indexOf(send);
  const int volumeIndex = track.pluginList.indexOf(volume);
  return sendIndex >= 0 && volumeIndex >= 0 && sendIndex < volumeIndex;
}

std::string trackIdForNativeId(
    const ProjectState& projectState,
    const juce::Array<te::AudioTrack*>& nativeTracks,
    te::EditItemID itemId) {
  if (!itemId.isValid()) {
    return {};
  }

  const auto& uiTracks = projectState.uiTracks();
  for (std::size_t index = 0; index < uiTracks.size(); ++index) {
    if (index < static_cast<std::size_t>(nativeTracks.size()) &&
        nativeTracks[static_cast<int>(index)] != nullptr &&
        nativeTracks[static_cast<int>(index)]->itemID == itemId) {
      return uiTracks[index].id;
    }
  }
  return {};
}

}  // namespace

std::string nativeRoutingOutputTrackId(
    const ProjectState& projectState,
    const juce::Array<te::AudioTrack*>& nativeTracks,
    te::AudioTrack* nativeTrack) {
  if (nativeTrack == nullptr) {
    return {};
  }
  auto* destination = nativeTrack->getOutput().getDestinationTrack();
  if (destination == nullptr) {
    return "master";
  }

  const auto& uiTracks = projectState.uiTracks();
  for (std::size_t index = 0; index < uiTracks.size(); ++index) {
    if (index < static_cast<std::size_t>(nativeTracks.size()) &&
        nativeTracks[static_cast<int>(index)] == destination) {
      return uiTracks[index].id;
    }
  }
  return {};
}

int nativeAuxReturnBusNumber(te::AudioTrack* nativeTrack) {
  if (nativeTrack == nullptr) {
    return -1;
  }

  for (auto* plugin : nativeTrack->pluginList) {
    if (auto* auxReturn = dynamic_cast<te::AuxReturnPlugin*>(plugin)) {
      return auxReturn->busNumber;
    }
  }
  return -1;
}

nlohmann::json nativeAuxSendsJson(
    const ProjectState& projectState,
    te::AudioTrack* nativeTrack) {
  nlohmann::json sends = nlohmann::json::array();
  if (nativeTrack == nullptr) {
    return sends;
  }

  const auto targetsByBus = auxTargetsByBus(projectState);
  for (auto* plugin : nativeTrack->pluginList) {
    auto* auxSend = dynamic_cast<te::AuxSendPlugin*>(plugin);
    if (auxSend == nullptr) {
      continue;
    }

    const int busNumber = auxSend->getBusNumber();
    const auto target = targetsByBus.find(busNumber);
    sends.push_back({
        {"busNumber", busNumber},
        {"targetTrackId", target != targetsByBus.end() ? target->second : std::string{}},
        {"gainDb", auxSend->getGainDb()},
        {"muted", auxSend->isMute()},
        {"preFader", auxSendIsPreFader(*nativeTrack, auxSend)},
    });
  }
  return sends;
}

nlohmann::json nativeSidechainPluginsJson(
    const ProjectState& projectState,
    const juce::Array<te::AudioTrack*>& nativeTracks,
    te::AudioTrack* nativeTrack) {
  nlohmann::json plugins = nlohmann::json::array();
  if (nativeTrack == nullptr) {
    return plugins;
  }

  for (auto* plugin : nativeTrack->pluginList) {
    if (plugin == nullptr || !plugin->getSidechainSourceID().isValid()) {
      continue;
    }
    plugins.push_back({
        {"pluginName", plugin->getName().toStdString()},
        {"pluginType", plugin->getPluginType().toStdString()},
        {"sourceTrackId", trackIdForNativeId(
            projectState,
            nativeTracks,
            plugin->getSidechainSourceID())},
        {"wireCount", plugin->getNumWires()},
        {"canSidechain", plugin->canSidechain()},
    });
  }
  return plugins;
}

}  // namespace musicapp
