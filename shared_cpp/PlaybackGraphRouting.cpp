#include "PlaybackDeviceRouting.h"

#include <tracktion_engine/tracktion_engine.h>

namespace te = tracktion::engine;

namespace musicapp {

std::optional<std::string> PlaybackDeviceRouting::prepareForAudiblePlayback(
    te::Engine& engine,
    te::Edit& edit) {
  if (const auto error = reopenDefaultPlaybackDevice(engine)) {
    return error;
  }

  syncWaveDevices(engine);
  ensureOutputRouting(engine, edit);
  return std::nullopt;
}

void PlaybackDeviceRouting::syncWaveDevicesThenRebuild(te::Engine& engine, te::Edit& edit) {
  syncWaveDevices(engine);
  rebuildPlaybackGraph(engine, edit);
}

void PlaybackDeviceRouting::rebuildPlaybackGraph(te::Engine& engine, te::Edit& edit) {
  ensureOutputRouting(engine, edit);
  auto& transport = edit.getTransport();
  transport.ensureContextAllocated(true);
  edit.restartPlayback();
}

void PlaybackDeviceRouting::syncWaveDevices(te::Engine& engine) {
  auto& deviceManager = engine.getDeviceManager();
  deviceManager.rescanWaveDeviceList();
  deviceManager.dispatchPendingUpdates();
}

void PlaybackDeviceRouting::ensureOutputRouting(te::Engine& engine, te::Edit& edit) {
  auto& deviceManager = engine.getDeviceManager();

  for (int index = 0; index < deviceManager.getNumWaveOutDevices(); ++index) {
    if (auto* waveOut = deviceManager.getWaveOutDevice(index)) {
      if (!waveOut->isEnabled()) {
        waveOut->setEnabled(true);
      }
    }
  }

  for (auto* track : te::getAudioTracks(edit)) {
    if (track == nullptr) {
      continue;
    }

    auto& output = track->getOutput();
    if (output.getDestinationTrack() != nullptr) {
      continue;
    }
    if (!output.canPlayAudio()) {
      output.setOutputToDefaultDevice(false);
    }
  }
}

}  // namespace musicapp
