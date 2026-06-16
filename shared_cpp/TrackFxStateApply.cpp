#include "TrackFxStateApply.h"

#include "JsonResponse.h"
#include "MusicAppAirwindowsFxPlugin.h"
#include "MusicAppAmpSimPlugin.h"
#include "MusicAppGainTrimPlugin.h"
#include "SamplerInstrumentCommands.h"
#include "TrackFxExternalPluginInsert.h"
#include "TrackFxJson.h"
#include "TrackFxPluginChain.h"

namespace musicapp {

namespace te = tracktion::engine;

namespace {

bool isLegacyManagedFxPlugin(te::Plugin* plugin) {
  if (plugin == nullptr) {
    return false;
  }
  return dynamic_cast<te::EqualiserPlugin*>(plugin) != nullptr
         || dynamic_cast<te::CompressorPlugin*>(plugin) != nullptr
         || plugin->getPluginType() == "musicapp_reverb";
}

bool isManagedFxPlugin(te::Plugin* plugin) {
  return isManagedMusicAppFxPlugin(plugin) ||
      isLegacyManagedFxPlugin(plugin) ||
      isManagedExternalFxPlugin(plugin);
}

void clearManagedFxPlugins(te::AudioTrack& track) {
  const auto plugins = track.pluginList.getPlugins();
  for (auto* plugin : plugins) {
    if (plugin != nullptr && isManagedFxPlugin(plugin)) {
      plugin->deleteFromParent();
    }
  }
}

int effectInsertIndex(te::AudioTrack& track) {
  for (int index = 0; index < track.pluginList.size(); ++index) {
    if (dynamic_cast<te::FourOscPlugin*>(track.pluginList[index]) != nullptr
        || isSamplerInstrumentPlugin(track.pluginList[index])
        || isManagedGainTrimPlugin(track.pluginList[index])
        || isManagedAmpSimPlugin(track.pluginList[index])) {
      return index + 1;
    }
  }
  return 0;
}

void applySlot(
    MusicAppAirwindowsFxPlugin& plugin,
    bool active,
    const PluginFxParamsState& params) {
  plugin.setPluginValues(params.values);
  plugin.setEnabled(active);
}

juce::ValueTree treeForSlot(const std::string& slot) {
  if (slot == "eq") {
    return MusicAppAirwindowsFxPlugin::createEq();
  }
  if (slot == "compressor") {
    return MusicAppAirwindowsFxPlugin::createCompressor();
  }
  return MusicAppAirwindowsFxPlugin::createReverb();
}

bool slotEnabled(const TrackFxState& state, const std::string& slot) {
  if (slot == "eq") {
    return state.eqEnabled;
  }
  if (slot == "compressor") {
    return state.compressorEnabled;
  }
  return state.reverbEnabled;
}

bool chainSlotIsNativeActive(
    const TrackFxState& state,
    const PluginChainSlotState& chainSlot) {
  return slotEnabled(state, chainSlot.slot) &&
      (chainSlotCanUseManagedNativePlugin(chainSlot) ||
       chainSlotCanUseExternalNativePlugin(chainSlot)) &&
      chainSlot.enabled &&
      !chainSlot.bypassed;
}

void applySlotState(
    MusicAppAirwindowsFxPlugin& plugin,
    const TrackFxState& state,
    const PluginChainSlotState& chainSlot) {
  const bool active = chainSlotIsNativeActive(state, chainSlot);
  if (plugin.slotId() == "eq") {
    applySlot(plugin, active, state.eq);
  } else if (plugin.slotId() == "compressor") {
    applySlot(plugin, active, state.compressor);
  } else {
    applySlot(plugin, active, state.reverb);
  }
}

std::vector<MusicAppAirwindowsFxPlugin*> managedFxPluginsAtInsertPoint(
    te::AudioTrack& track,
    std::size_t count) {
  std::vector<MusicAppAirwindowsFxPlugin*> plugins;
  const int startIndex = effectInsertIndex(track);
  for (int index = 0; index < track.pluginList.size(); ++index) {
    auto* plugin = track.pluginList[index];
    if (isLegacyManagedFxPlugin(plugin) || isManagedExternalFxPlugin(plugin)) {
      return {};
    }
    auto* fx = dynamic_cast<MusicAppAirwindowsFxPlugin*>(plugin);
    if (fx == nullptr) {
      continue;
    }
    const int expectedIndex = startIndex + static_cast<int>(plugins.size());
    if (index != expectedIndex || plugins.size() >= count) {
      return {};
    }
    plugins.push_back(fx);
  }
  return plugins;
}

bool updateManagedFxInPlace(te::AudioTrack& track, const TrackFxState& state) {
  const auto chain = normalizePluginChain(state);
  const auto plugins = managedFxPluginsAtInsertPoint(track, chain.size());
  if (chain.size() != plugins.size()) {
    return false;
  }

  for (std::size_t index = 0; index < chain.size(); ++index) {
    const auto& chainSlot = chain[index];
    auto* plugin = plugins[index];
    if (!chainSlotCanUseManagedNativePlugin(chainSlot) || plugin == nullptr ||
        plugin->slotId() != chainSlot.slot ||
        plugin->pluginId() != chainSlot.pluginId) {
      return false;
    }
  }

  for (std::size_t index = 0; index < chain.size(); ++index) {
    applySlotState(*plugins[index], state, chain[index]);
  }
  return true;
}

nlohmann::json nativePluginOrderJson(te::AudioTrack& track) {
  nlohmann::json order = nlohmann::json::array();
  for (auto* plugin : track.pluginList) {
    if (auto* fx = dynamic_cast<MusicAppAirwindowsFxPlugin*>(plugin)) {
      order.push_back(fx->slotId());
    } else if (isManagedExternalFxPlugin(plugin)) {
      order.push_back(managedExternalFxSlotId(plugin));
    }
  }
  return order;
}

nlohmann::json nativePluginBypassJson(te::AudioTrack& track) {
  nlohmann::json bypass = nlohmann::json::object();
  for (auto* plugin : track.pluginList) {
    if (auto* fx = dynamic_cast<MusicAppAirwindowsFxPlugin*>(plugin)) {
      bypass[fx->slotId()] = !fx->isEnabled();
    } else if (isManagedExternalFxPlugin(plugin)) {
      bypass[managedExternalFxSlotId(plugin)] = !plugin->isEnabled();
    }
  }
  return bypass;
}

}  // namespace

CommandResult applyFxState(te::Edit& edit, te::AudioTrack& track, const TrackFxState& state) {
  if (updateManagedFxInPlace(track, state)) {
    return makeSuccess("set_track_fx");
  }

  clearManagedFxPlugins(track);
  int insertIndex = effectInsertIndex(track);
  for (const auto& chainSlot : normalizePluginChain(state)) {
    if (!chainSlotCanUseManagedNativePlugin(chainSlot)) {
      if (!chainSlotCanUseExternalNativePlugin(chainSlot)) {
        continue;
      }
      const auto result = insertExternalFxPlugin(
          edit, track, chainSlot, insertIndex++, chainSlotIsNativeActive(state, chainSlot));
      if (!result.ok) {
        return result;
      }
      continue;
    }
    auto plugin = edit.getPluginCache().createNewPlugin(treeForSlot(chainSlot.slot));
    auto* fx = dynamic_cast<MusicAppAirwindowsFxPlugin*>(plugin.get());
    if (fx == nullptr) {
      return makeError("set_track_fx", "plugin_create_failed", "Could not create FX plugin.");
    }
    track.pluginList.insertPlugin(plugin, insertIndex++, nullptr);
    applySlotState(*fx, state, chainSlot);
  }
  return makeSuccess("set_track_fx");
}

nlohmann::json trackFxResponseJson(
    const std::string& trackId,
    const TrackFxState& state,
    te::AudioTrack& track) {
  auto json = trackFxStateToJson(trackId, state);
  json["nativePluginOrder"] = nativePluginOrderJson(track);
  json["nativePluginBypass"] = nativePluginBypassJson(track);
  return json;
}

CommandResult reconcileManagedTrackFx(
    te::Edit& edit,
    ProjectState& projectState,
    const std::string& commandName) {
  const auto tracks = te::getAudioTracks(edit);
  for (auto* track : tracks) {
    if (track != nullptr) {
      clearManagedFxPlugins(*track);
    }
  }

  const auto& uiTracks = projectState.uiTracks();
  for (std::size_t index = 0; index < uiTracks.size(); ++index) {
    if (!projectState.hasTrackFxState(uiTracks[index].id)) {
      continue;
    }
    if (index >= static_cast<std::size_t>(tracks.size()) ||
        tracks[static_cast<int>(index)] == nullptr) {
      return makeError(commandName, "track_not_found", "Track ID is not mapped.");
    }

    const auto result = applyFxState(
        edit,
        *tracks[static_cast<int>(index)],
        projectState.trackFxState(uiTracks[index].id));
    if (!result.ok) {
      return makeError(commandName, result.errorCode, result.errorMessage);
    }
  }

  return makeSuccess(commandName);
}

}  // namespace musicapp
