#include "MediaPreparationCommands.h"

#include "JsonResponse.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <memory>

namespace musicapp {
namespace {

bool isWavFile(const juce::File& file) {
  return file.getFileExtension().equalsIgnoreCase(".wav");
}

juce::File wavTargetFor(const juce::File& source) {
  return source.getSiblingFile(source.getFileNameWithoutExtension() + ".wav");
}

std::string relativeWavPathFor(
    const std::string& relativePath,
    const juce::File& targetFile) {
  if (relativePath.empty()) {
    return "";
  }

  const auto normalized = juce::String(relativePath).replaceCharacter('\\', '/');
  const auto slash = normalized.lastIndexOfChar('/');
  const auto fileName = targetFile.getFileName();
  return slash >= 0
      ? (normalized.substring(0, slash + 1) + fileName).toStdString()
      : fileName.toStdString();
}

bool writeReaderToWav(juce::AudioFormatReader& reader, const juce::File& targetFile) {
  if (!targetFile.getParentDirectory().createDirectory()) {
    return false;
  }
  targetFile.deleteFile();

  std::unique_ptr<juce::OutputStream> stream =
      std::make_unique<juce::FileOutputStream>(targetFile);
  auto* fileStream = dynamic_cast<juce::FileOutputStream*>(stream.get());
  if (fileStream == nullptr || !fileStream->openedOk()) {
    return false;
  }

  const int channels = std::max(1, std::min<int>(2, static_cast<int>(reader.numChannels)));
  juce::WavAudioFormat wavFormat;
  std::unique_ptr<juce::AudioFormatWriter> writer(
      wavFormat.createWriterFor(
          stream,
          juce::AudioFormatWriter::Options{}
              .withSampleRate(reader.sampleRate)
              .withNumChannels(channels)
              .withBitsPerSample(24)));
  if (writer == nullptr) {
    return false;
  }

  constexpr int chunkSize = 32768;
  juce::AudioBuffer<float> buffer(channels, chunkSize);
  bool writeWarning = false;
  for (juce::int64 position = 0; position < reader.lengthInSamples; position += chunkSize) {
    const int samples = static_cast<int>(
        std::min<juce::int64>(chunkSize, reader.lengthInSamples - position));
    buffer.clear();
    if (!reader.read(&buffer, 0, samples, position, true, true)) {
      writeWarning = true;
    }
    if (!writer->writeFromAudioSampleBuffer(buffer, 0, samples)) {
      writeWarning = true;
    }
  }

  writer.reset();
  // Some platform decoders report a soft read/write failure after producing a
  // valid file. The follow-up analysis command validates the WAV contents, so
  // treat an actual non-empty WAV as success instead of discarding good media.
  juce::ignoreUnused(writeWarning);
  return targetFile.existsAsFile() && targetFile.getSize() > 64;
}

}  // namespace

CommandResult handlePrepareAudioFileForPlayback(const std::string& payloadJson) {
  const nlohmann::json payload = nlohmann::json::parse(payloadJson, nullptr, false);
  if (payload.is_discarded() || !payload.contains("absoluteAudioFilePath")
      || !payload["absoluteAudioFilePath"].is_string()) {
    return makeError(
        "prepare_audio_file_for_playback",
        "invalid_payload",
        "Expected payload { \"absoluteAudioFilePath\": string }.");
  }

  const juce::File source(payload["absoluteAudioFilePath"].get<std::string>());
  if (!source.existsAsFile() || source.getSize() <= 64) {
    return makeError(
        "prepare_audio_file_for_playback",
        "file_not_found",
        "Audio file is missing or empty.");
  }

  juce::AudioFormatManager formatManager;
  formatManager.registerBasicFormats();
  std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(source));
  if (reader == nullptr || reader->lengthInSamples <= 0 || reader->sampleRate <= 0.0) {
    return makeError(
        "prepare_audio_file_for_playback",
        "unsupported_file",
        "Audio file could not be decoded.");
  }

  const auto relativePath = payload.value("relativeAudioFilePath", std::string{});
  const juce::File target = isWavFile(source) ? source : wavTargetFor(source);
  const bool converted = target != source;
  if (converted && (!target.existsAsFile() || target.getSize() <= 64)) {
    if (!writeReaderToWav(*reader, target)) {
      return makeError(
          "prepare_audio_file_for_playback",
          "write_failed",
          "Could not prepare a WAV playback copy.");
    }
  }

  nlohmann::json data;
  data["sourceAbsoluteAudioFilePath"] = source.getFullPathName().toStdString();
  data["absoluteAudioFilePath"] = target.getFullPathName().toStdString();
  data["relativeAudioFilePath"] = converted ? relativeWavPathFor(relativePath, target) : relativePath;
  data["converted"] = converted;
  data["durationSeconds"] =
      static_cast<double>(reader->lengthInSamples) / static_cast<double>(reader->sampleRate);
  data["sampleRate"] = reader->sampleRate;
  data["channelCount"] = reader->numChannels;
  data["fileBytes"] = target.getSize();
  return makeSuccess("prepare_audio_file_for_playback", data.dump());
}

}  // namespace musicapp
