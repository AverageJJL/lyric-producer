#include "TrackFxPluginScan.h"

#include "JsonResponse.h"
#include "TrackFxHostCapabilities.h"
#include "TrackFxPluginScanPaths.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <unordered_set>
#include <vector>

namespace musicapp {

namespace fs = std::filesystem;

namespace {

struct ScanOptions {
  std::vector<fs::path> paths;
  std::set<std::string> formats{"external_au", "external_vst3"};
  bool recursive = true;
  std::size_t maxCandidates = 512;
};

struct ScanStats {
  std::size_t auCount = 0;
  std::size_t vst3Count = 0;
};

std::string normalizedPath(const fs::path& path) {
  std::error_code error;
  const auto absolute = fs::absolute(path, error);
  return (error ? path : absolute).lexically_normal().string();
}

bool extensionEquals(const fs::path& path, std::string_view expected) {
  const auto extension = path.extension().string();
  if (extension.size() != expected.size()) {
    return false;
  }
  for (std::size_t index = 0; index < expected.size(); ++index) {
    const auto left = static_cast<unsigned char>(extension[index]);
    const auto right = static_cast<unsigned char>(expected[index]);
    if (std::tolower(left) != std::tolower(right)) {
      return false;
    }
  }
  return true;
}

std::string formatForPath(const fs::path& path) {
  if (extensionEquals(path, ".component")) {
    return "external_au";
  }
  if (extensionEquals(path, ".vst3")) {
    return "external_vst3";
  }
  return {};
}

bool allowedFormat(const ScanOptions& options, const std::string& format) {
  return !format.empty() && options.formats.find(format) != options.formats.end();
}

nlohmann::json scannedPathJson(
    const fs::path& path,
    const std::string& status,
    const std::string& reason = {}) {
  nlohmann::json result{{"path", normalizedPath(path)}, {"status", status}};
  if (!reason.empty()) {
    result["reason"] = reason;
  }
  return result;
}

nlohmann::json candidateJson(const fs::path& path, const std::string& format, const std::string& absolute) {
  const auto displayName = path.stem().string().empty() ? path.filename().string() : path.stem().string();
  const bool hostEnabled = externalPluginFormatEnabled(format);
  auto candidate = nlohmann::json{
      {"pluginId", format + ":" + absolute},
      {"displayName", displayName},
      {"format", format},
      {"path", absolute},
      {"status", hostEnabled ? "available" : "disabled"},
  };
  if (!hostEnabled) {
    candidate["recoveryHint"] = externalPluginRecoveryHint(format);
  }
  return candidate;
}

void addCandidate(
    const fs::path& path,
    const ScanOptions& options,
    std::unordered_set<std::string>& seenPaths,
    nlohmann::json& candidates,
    ScanStats& stats,
    bool& truncated) {
  const auto format = formatForPath(path);
  if (!allowedFormat(options, format)) {
    return;
  }

  const auto absolute = normalizedPath(path);
  if (seenPaths.find(absolute) != seenPaths.end()) {
    return;
  }
  if (candidates.size() >= options.maxCandidates) {
    truncated = true;
    return;
  }

  seenPaths.insert(absolute);
  candidates.push_back(candidateJson(path, format, absolute));
  if (format == "external_au") {
    ++stats.auCount;
  } else if (format == "external_vst3") {
    ++stats.vst3Count;
  }
}

std::optional<ScanOptions> parseOptions(
    const nlohmann::json& payload,
    std::string& errorMessage) {
  ScanOptions options;

  if (payload.contains("paths")) {
    if (!payload["paths"].is_array()) {
      errorMessage = "paths must be an array of strings.";
      return std::nullopt;
    }
    for (const auto& item : payload["paths"]) {
      if (!item.is_string() || item.get<std::string>().empty()) {
        errorMessage = "paths must contain non-empty strings.";
        return std::nullopt;
      }
      options.paths.push_back(fs::path(item.get<std::string>()));
    }
  }

  if (payload.contains("formats")) {
    if (!payload["formats"].is_array()) {
      errorMessage = "formats must be an array.";
      return std::nullopt;
    }
    options.formats.clear();
    for (const auto& item : payload["formats"]) {
      if (!item.is_string()) {
        errorMessage = "formats must contain strings.";
        return std::nullopt;
      }
      const auto format = item.get<std::string>();
      if (format != "external_au" && format != "external_vst3") {
        errorMessage = "formats may only include external_au or external_vst3.";
        return std::nullopt;
      }
      options.formats.insert(format);
    }
  }

  if (payload.contains("recursive")) {
    if (!payload["recursive"].is_boolean()) {
      errorMessage = "recursive must be a boolean.";
      return std::nullopt;
    }
    options.recursive = payload["recursive"].get<bool>();
  }

  if (payload.contains("maxCandidates")) {
    if (!payload["maxCandidates"].is_number_unsigned()) {
      errorMessage = "maxCandidates must be a positive integer.";
      return std::nullopt;
    }
    options.maxCandidates = std::clamp<std::size_t>(
        payload["maxCandidates"].get<std::size_t>(),
        1,
        2048);
  }

  return options;
}

void scanDirectory(
    const fs::path& root,
    const ScanOptions& options,
    std::unordered_set<std::string>& seenPaths,
    nlohmann::json& candidates,
    ScanStats& stats,
    bool& truncated) {
  std::error_code error;
  if (options.recursive) {
    fs::recursive_directory_iterator iterator(
        root,
        fs::directory_options::skip_permission_denied,
        error);
    const fs::recursive_directory_iterator end;
    while (!error && iterator != end) {
      if (truncated) {
        return;
      }
      const auto path = iterator->path();
      const auto format = formatForPath(path);
      if (allowedFormat(options, format)) {
        addCandidate(path, options, seenPaths, candidates, stats, truncated);
        if (iterator->is_directory(error)) {
          iterator.disable_recursion_pending();
        }
      }
      iterator.increment(error);
    }
    return;
  }

  for (fs::directory_iterator iterator(root, fs::directory_options::skip_permission_denied, error);
       !error && iterator != fs::directory_iterator();
       iterator.increment(error)) {
    if (truncated) {
      return;
    }
    addCandidate(iterator->path(), options, seenPaths, candidates, stats, truncated);
  }
}

}  // namespace

CommandResult handleScanFxPlugins(const std::string& payloadJson) {
  const auto payload = payloadJson.empty()
      ? nlohmann::json::object()
      : nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.is_object()) {
    return makeError("scan_fx_plugins", "invalid_payload", "Expected object payload.");
  }

  std::string errorMessage;
  const auto options = parseOptions(payload, errorMessage);
  if (!options) {
    return makeError("scan_fx_plugins", "invalid_payload", errorMessage);
  }
  auto resolvedOptions = *options;
  if (resolvedOptions.paths.empty()) {
    resolvedOptions.paths = defaultFxPluginScanPaths();
  }

  nlohmann::json scannedPaths = nlohmann::json::array();
  nlohmann::json candidates = nlohmann::json::array();
  std::unordered_set<std::string> seenPaths;
  ScanStats stats;
  bool truncated = false;

  for (const auto& path : resolvedOptions.paths) {
    std::error_code error;
    if (!fs::exists(path, error)) {
      scannedPaths.push_back(scannedPathJson(path, "missing"));
      continue;
    }

    addCandidate(path, resolvedOptions, seenPaths, candidates, stats, truncated);
    if (!fs::is_directory(path, error)) {
      scannedPaths.push_back(scannedPathJson(path, "not_directory"));
      continue;
    }

    scannedPaths.push_back(scannedPathJson(path, "scanned"));
    if (!allowedFormat(resolvedOptions, formatForPath(path))) {
      scanDirectory(path, resolvedOptions, seenPaths, candidates, stats, truncated);
    }
  }

  return makeSuccess(
      "scan_fx_plugins",
      nlohmann::json{
          {"scanVersion", 1},
          {"externalPluginHosting",
           externalPluginHostCapabilities().anyEnabled() ? externalPluginHostingStatus() : "scan_metadata_only"},
          {"defaultPathsUsed", options->paths.empty()},
          {"recursive", resolvedOptions.recursive},
          {"truncated", truncated},
          {"scannedPaths", scannedPaths},
          {"formatCounts",
           {
               {"external_au", stats.auCount},
               {"external_vst3", stats.vst3Count},
           }},
          {"candidates", candidates},
      }.dump());
}

}  // namespace musicapp
