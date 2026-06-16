#include "SamplerInstrumentCommands.h"

#include "JsonResponse.h"
#include "MusicAppSamplerPlugin.h"

#include <nlohmann/json.hpp>
#include <vector>

namespace musicapp {

namespace te = tracktion::engine;

namespace {

struct SamplerRegion {
  std::string name;
  std::string relativePath;
  int rootNote = 60;
  int minNote = 0;
  int maxNote = 127;
  float gainDb = 0.0f;
  double sourceStartSeconds = 0.0;
  double sourceEndSeconds = -1.0;
};

std::vector<SamplerRegion> parseRegions(const nlohmann::json& payload) {
  std::vector<SamplerRegion> regions;
  if (!payload.contains("params") || !payload["params"].contains("samples")
      || !payload["params"]["samples"].is_array()) {
    return regions;
  }

  for (const auto& item : payload["params"]["samples"]) {
    if (!item.is_object() || !item.contains("relativePath")) {
      continue;
    }

    SamplerRegion region;
    region.name = item.value("name", std::string{"Sample"});
    region.relativePath = item.value("relativePath", std::string{});
    region.rootNote = item.value("rootNote", 60);
    region.minNote = item.value("minNote", region.rootNote);
    region.maxNote = item.value("maxNote", region.rootNote);
    region.gainDb = static_cast<float>(item.value("gainDb", 0.0));
    region.sourceStartSeconds = item.value("sourceStartSeconds", 0.0);
    region.sourceEndSeconds = item.value("sourceEndSeconds", -1.0);
    if (!region.relativePath.empty()) {
      regions.push_back(region);
    }
  }
  return regions;
}

std::vector<MusicAppSamplerPlugin::RegionSpec> resolveRegions(
    ProjectState& projectState,
    const std::vector<SamplerRegion>& regions,
    std::string& missingPath) {
  std::vector<MusicAppSamplerPlugin::RegionSpec> specs;
  specs.reserve(regions.size());

  for (const auto& region : regions) {
    const auto path = projectState.resolveAssetPath(region.relativePath);
    const juce::File file(path);
    if (!file.existsAsFile()) {
      missingPath = path;
      return {};
    }

    specs.push_back({
        region.name,
        path,
        region.rootNote,
        region.minNote,
        region.maxNote,
        region.gainDb,
        region.sourceStartSeconds,
        region.sourceEndSeconds,
    });
  }

  return specs;
}

}  // namespace

MusicAppSamplerPlugin* findSamplerOnTrack(te::AudioTrack& track) {
  for (auto* plugin : track.pluginList) {
    if (auto* sampler = dynamic_cast<MusicAppSamplerPlugin*>(plugin)) {
      return sampler;
    }
  }
  return nullptr;
}

bool isSamplerInstrumentPlugin(te::Plugin* plugin) {
  return dynamic_cast<MusicAppSamplerPlugin*>(plugin) != nullptr
         || dynamic_cast<te::SamplerPlugin*>(plugin) != nullptr;
}

void removeSamplerPlugins(te::AudioTrack& track) {
  const auto plugins = track.pluginList.getPlugins();
  for (auto* plugin : plugins) {
    if (isSamplerInstrumentPlugin(plugin)) {
      plugin->deleteFromParent();
    }
  }
}

CommandResult configureSamplerInstrument(
    te::Edit& edit,
    ProjectState& projectState,
    te::AudioTrack& track,
    const std::string& trackId,
    const nlohmann::json& payload) {
  const auto regions = parseRegions(payload);
  if (regions.empty()) {
    return makeError(
        "assign_track_instrument",
        "invalid_sampler_regions",
        "Sample instruments require params.samples with sample regions.");
  }

  std::string missingPath;
  const auto specs = resolveRegions(projectState, regions, missingPath);
  if (!missingPath.empty()) {
    return makeError("assign_track_instrument", "sample_missing", missingPath);
  }

  if (auto* existing = findSamplerOnTrack(track)) {
    const auto loadResult = existing->setRegions(specs);
    if (!loadResult.ok) {
      return makeError("assign_track_instrument", loadResult.errorCode, loadResult.message);
    }
    projectState.setTrackPreset(trackId, payload.value("presetId", std::string{"sample_instrument"}));
    return makeSuccess("assign_track_instrument", "{}");
  }

  auto plugin = edit.getPluginCache().createNewPlugin(MusicAppSamplerPlugin::create());
  auto* sampler = dynamic_cast<MusicAppSamplerPlugin*>(plugin.get());
  if (sampler == nullptr) {
    return makeError(
        "assign_track_instrument",
        "plugin_create_failed",
        "Could not create sampler plugin.");
  }

  const auto loadResult = sampler->setRegions(specs);
  if (!loadResult.ok) {
    return makeError("assign_track_instrument", loadResult.errorCode, loadResult.message);
  }

  // Loading succeeded while detached, so replacing the old instrument cannot
  // leave the track silent if any sample path or decoder was bad.
  removeSamplerPlugins(track);
  track.pluginList.insertPlugin(plugin, 0, nullptr);
  projectState.setTrackPreset(trackId, payload.value("presetId", std::string{"sample_instrument"}));
  return makeSuccess("assign_track_instrument", "{}");
}

}  // namespace musicapp
