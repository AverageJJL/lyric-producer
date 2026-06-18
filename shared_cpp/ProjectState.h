#pragma once

#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace musicapp {

struct PluginFxParamsState {
  std::string pluginId;
  std::unordered_map<std::string, double> values;
};

struct PluginChainSlotState {
  std::string slot;
  std::string pluginId;
  std::string displayName;
  std::string format = "builtin_airwindows";
  bool enabled = false;
  bool bypassed = true;
  int order = 0;
  std::string status = "available";
  std::string recoveryHint;
};

struct TrackFxState {
  bool eqEnabled = false;
  PluginFxParamsState eq;
  bool compressorEnabled = false;
  PluginFxParamsState compressor;
  bool reverbEnabled = false;
  PluginFxParamsState reverb;
  std::vector<PluginChainSlotState> pluginChain;
};

/** Rack defaults for the three pinned Airwindows processors. */
TrackFxState defaultTrackFxState();

struct AmpSimPedalState {
  std::string id;
  std::string type;
  bool enabled = true;
  std::unordered_map<std::string, double> params;
};

struct AmpSimCabinetState {
  bool enabled = true;
  std::string irId = "guitar_us_2x12";
  double mix = 1.0;
};

struct AmpSimState {
  bool enabled = false;
  std::string inputMode = "guitar_di";
  std::vector<AmpSimPedalState> pedals;
  AmpSimCabinetState cabinet;
};

AmpSimState defaultAmpSimState();

struct UiTrackRoutingSend {
  std::string targetTrackId;
  double gainDb = 0.0;
  bool preFader = false;
};

struct UiTrackAutomationPoint {
  double beat = 0.0;
  double value = 0.0;
};

struct UiTrackAutomationLane {
  std::string targetType;
  std::string parameterId;
  std::vector<UiTrackAutomationPoint> points;
};

struct UiTrackRecord {
  std::string id;
  std::string name;
  bool isMuted = false;
  bool isSolo = false;
  std::string type;
  std::string instrumentId;
  std::string presetId;
  bool isRecordArmed = false;
  bool isInputMonitoringEnabled = false;
  bool isFrozen = false;
  std::string trackFolderName;
  std::string trackGroupName;
  std::string automationMode = "read";
  int automationLaneCount = 0;
  std::vector<UiTrackAutomationLane> automationLanes;
  double volumeDb = 0.0;
  double pan = 0.0;
  double gainDb = 0.0;
  double effectiveVolumeDb = 0.0;
  std::string routingRole = "track";
  std::string routingOutputTrackId = "master";
  std::vector<UiTrackRoutingSend> routingSends;
  std::string routingSidechainSourceTrackId;
};

/** Maps UI track metadata and asset paths without pulling in Tracktion headers. */
class ProjectState {
 public:
  void setAssetRoot(std::string root);
  void setWritableAssetRoot(std::string root);
  const std::string& assetRoot() const { return assetRoot_; }
  const std::string& writableAssetRoot() const { return writableAssetRoot_; }

  std::string resolveAssetPath(const std::string& relativePath) const;

  void updateUiTracks(const std::vector<UiTrackRecord>& tracks);
  const std::vector<UiTrackRecord>& uiTracks() const { return uiTracks_; }

  int trackIndexForId(const std::string& trackId) const;
  bool upsertTrackAutomationPoint(
      const std::string& trackId,
      const std::string& targetType,
      const std::string& parameterId,
      double beat,
      double value,
      UiTrackAutomationLane& updatedLane);

  void setDrumKitSamples(
      const std::string& trackId,
      const std::unordered_map<std::string, std::string>& samples);
  std::string drumSamplePath(const std::string& trackId, const std::string& sampleKey) const;

  void setTrackInstrument(const std::string& trackId, const std::string& instrument);
  std::string trackInstrument(const std::string& trackId) const;

  void setTrackPreset(const std::string& trackId, const std::string& presetId);
  std::string trackPreset(const std::string& trackId) const;

  void setTrackRecordArmed(const std::string& trackId, bool armed);
  bool isTrackRecordArmed(const std::string& trackId) const;

  void setTrackFxState(const std::string& trackId, TrackFxState state);
  bool hasTrackFxState(const std::string& trackId) const;
  TrackFxState trackFxState(const std::string& trackId) const;

  void setAmpSimState(const std::string& trackId, AmpSimState state);
  bool hasAmpSimState(const std::string& trackId) const;
  AmpSimState ampSimState(const std::string& trackId) const;

 private:
  std::string assetRoot_;
  std::string writableAssetRoot_;
  std::vector<UiTrackRecord> uiTracks_;
  std::unordered_map<std::string, int> trackIndexById_;
  std::unordered_map<std::string, std::unordered_map<std::string, std::string>> drumKitByTrack_;
  std::unordered_map<std::string, std::string> instrumentByTrack_;
  std::unordered_map<std::string, std::string> presetByTrack_;
  std::unordered_map<std::string, bool> recordArmedByTrack_;
  std::unordered_map<std::string, TrackFxState> fxByTrack_;
  std::unordered_map<std::string, AmpSimState> ampSimByTrack_;
};

}  // namespace musicapp
