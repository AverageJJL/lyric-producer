#pragma once

#include "CommandTypes.h"
#include "ProjectState.h"

#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include <tracktion_engine/tracktion_engine.h>

namespace musicapp {

class MixdownRenderManager {
 public:
  CommandResult start(
      tracktion::engine::Engine& engine,
      tracktion::engine::Edit& edit,
      ProjectState& projectState,
      const std::string& payloadJson);

  CommandResult cancel(const std::string& payloadJson);
  CommandResult status(const std::string& payloadJson);
  bool hasRunningRender() const;

 private:
  struct RenderState;

  std::shared_ptr<RenderState> findRender(const std::string& requestId) const;

  mutable std::mutex mutex_;
  std::vector<std::shared_ptr<RenderState>> renders_;
};

}  // namespace musicapp
