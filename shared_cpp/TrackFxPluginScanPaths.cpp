#include "TrackFxPluginScanPaths.h"

#include <cstdlib>
#include <string>

namespace musicapp {

namespace fs = std::filesystem;

namespace {

void appendPathList(std::vector<fs::path>& paths, const char* pathList) {
  if (pathList == nullptr || std::string(pathList).empty()) {
    return;
  }
  const char separator =
#if defined(_WIN32)
      ';';
#else
      ':';
#endif
  const std::string remaining(pathList);
  std::size_t start = 0;
  while (start <= remaining.size()) {
    const auto end = remaining.find(separator, start);
    const auto count = end == std::string::npos ? std::string::npos : end - start;
    const auto item = remaining.substr(start, count);
    if (!item.empty()) {
      paths.push_back(fs::path(item));
    }
    if (end == std::string::npos) {
      break;
    }
    start = end + 1;
  }
}

void appendEnvSubdir(std::vector<fs::path>& paths, const char* name, const char* subdir) {
  const char* value = std::getenv(name);
  if (value != nullptr && !std::string(value).empty()) {
    paths.push_back(fs::path(value) / subdir);
  }
}

}  // namespace

std::vector<fs::path> defaultFxPluginScanPaths() {
  std::vector<fs::path> paths;
  appendPathList(paths, std::getenv("MUSICAPP_FX_PLUGIN_PATHS"));
  if (!paths.empty()) {
    return paths;
  }

  const char* home = std::getenv("HOME");
  if (home != nullptr && !std::string(home).empty()) {
    paths.push_back(fs::path(home) / "Library/Audio/Plug-Ins/Components");
    paths.push_back(fs::path(home) / "Library/Audio/Plug-Ins/VST3");
  }
  paths.push_back(fs::path("/Library/Audio/Plug-Ins/Components"));
  paths.push_back(fs::path("/Library/Audio/Plug-Ins/VST3"));
  appendEnvSubdir(paths, "COMMONPROGRAMFILES", "VST3");
  appendEnvSubdir(paths, "ProgramFiles", "Common Files/VST3");
  return paths;
}

}  // namespace musicapp
