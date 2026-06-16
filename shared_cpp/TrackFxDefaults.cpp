#include "ProjectState.h"

#include "fx/AirwindowsFxCatalog.h"

namespace musicapp {

namespace {

PluginChainSlotState defaultChainSlot(
    const std::string& slot,
    const std::string& displayName,
    int order) {
  PluginChainSlotState chainSlot;
  chainSlot.slot = slot;
  chainSlot.pluginId = defaultAirwindowsPluginIdForSlot(slot);
  chainSlot.displayName = displayName;
  chainSlot.order = order;
  return chainSlot;
}

}  // namespace

TrackFxState defaultTrackFxState() {
  TrackFxState state;
  state.eq.pluginId = defaultAirwindowsPluginIdForSlot("eq");
  state.eq.values = defaultAirwindowsValuesForSlot("eq");
  state.compressor.pluginId = defaultAirwindowsPluginIdForSlot("compressor");
  state.compressor.values = defaultAirwindowsValuesForSlot("compressor");
  state.reverb.pluginId = defaultAirwindowsPluginIdForSlot("reverb");
  state.reverb.values = defaultAirwindowsValuesForSlot("reverb");
  state.pluginChain = {
      defaultChainSlot("eq", "Parametric", 0),
      defaultChainSlot("compressor", "Logical4", 1),
      defaultChainSlot("reverb", "MatrixVerb", 2),
  };
  return state;
}

}  // namespace musicapp
