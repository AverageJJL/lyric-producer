#pragma once

#include <memory>
#include <string>
#include <unordered_map>

namespace tracktion {
inline namespace engine {
class Edit;
class LevelMeasurer;
}  // namespace engine
}  // namespace tracktion

namespace musicapp {

class ProjectState;

/**
 * Owns persistent clients for Tracktion's native level measurers.
 *
 * LevelMeasurer only reports peaks to registered clients as audio blocks pass
 * through the native graph. Keeping these clients in C++ gives the renderer a
 * typed meter stream without ever inspecting samples in JavaScript.
 */
class MeterSnapshotReader {
 public:
  MeterSnapshotReader();
  ~MeterSnapshotReader();

  MeterSnapshotReader(const MeterSnapshotReader&) = delete;
  MeterSnapshotReader& operator=(const MeterSnapshotReader&) = delete;

  void reset();
  std::string snapshotJson(tracktion::engine::Edit& edit, const ProjectState& projectState);

 private:
  class MeterTap;

  std::unique_ptr<MeterTap> masterTap_;
  std::unordered_map<std::string, std::unique_ptr<MeterTap>> trackTaps_;
};

}  // namespace musicapp
