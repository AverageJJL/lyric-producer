#include "MusicAppEngineBehaviour.h"

#include "MusicAppAirwindowsFxPlugin.h"
#include "MusicAppAmpSimPlugin.h"
#include "MusicAppGainTrimPlugin.h"
#include "MusicAppReverbPlugin.h"
#include "MusicAppSamplerPlugin.h"
#include "TrackFxExternalPluginDescription.h"
#include "TrackFxHostCapabilities.h"

namespace musicapp {

namespace te = tracktion::engine;

namespace {

class MusicAppEngineBehaviour : public te::EngineBehaviour {
 public:
  te::Plugin::Ptr createCustomPlugin(te::PluginCreationInfo info) override {
    const auto type = info.state[te::IDs::type].toString();
    if (MusicAppAirwindowsFxPlugin::isMusicAppFxType(type)) {
      return new MusicAppAirwindowsFxPlugin(info);
    }
    if (type == MusicAppAmpSimPlugin::xmlTypeName) {
      return new MusicAppAmpSimPlugin(info);
    }
    if (type == MusicAppGainTrimPlugin::xmlTypeName) {
      return new MusicAppGainTrimPlugin(info);
    }
    if (type == MusicAppReverbPlugin::xmlTypeName) {
      return new MusicAppReverbPlugin(info);
    }
    if (type == MusicAppSamplerPlugin::xmlTypeName) {
      return new MusicAppSamplerPlugin(info);
    }

    return {};
  }

  std::unique_ptr<juce::PluginDescription> findDescriptionForFileOrID(
      const juce::String& fileOrID) override {
    const auto path = fileOrID.toStdString();
    const auto format = externalPluginFormatForPath(path);
    if (!externalPluginFormatEnabled(format)) {
      return {};
    }
    return findExternalPluginDescriptionForFile(path, format);
  }
};

}  // namespace

std::unique_ptr<te::EngineBehaviour> createMusicAppEngineBehaviour() {
  return std::make_unique<MusicAppEngineBehaviour>();
}

}  // namespace musicapp
