#pragma once

#include <atomic>
#include <cstdint>
#include <deque>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include <juce_audio_formats/juce_audio_formats.h>

namespace musicapp {

using CaptureEventEmitter = std::function<void(const std::string&, const std::string&)>;

struct AudioInputCaptureWorkerConfig {
  juce::AudioFormatWriter* writer = nullptr;
  CaptureEventEmitter emitEvent;
  std::string trackId;
  std::string clipId;
  std::string inputDeviceName;
};

class AudioInputCaptureWorker {
 public:
  AudioInputCaptureWorker() = default;
  ~AudioInputCaptureWorker();

  AudioInputCaptureWorker(const AudioInputCaptureWorker&) = delete;
  AudioInputCaptureWorker& operator=(const AudioInputCaptureWorker&) = delete;

  void start(AudioInputCaptureWorkerConfig config);
  void stop();
  bool isRunning() const;
  juce::int64 samplesWritten() const;

  void enqueue(const float* const* inputChannelData, int numInputChannels, int numSamples);

 private:
  struct CaptureBlock {
    int numChannels = 0;
    int numInputChannels = 0;
    int numSamples = 0;
    float peak = 0.0f;
    std::vector<float> samples;
  };

  void run();
  void writeBlock(CaptureBlock& block);
  void recordBlockPeak(const CaptureBlock& block);
  void flushPendingPeaks();

  mutable std::mutex mutex_;
  std::condition_variable ready_;
  std::deque<CaptureBlock> queue_;
  std::thread thread_;
  std::atomic<bool> accepting_{false};
  std::atomic<juce::int64> samplesWritten_{0};

  juce::AudioFormatWriter* writer_ = nullptr;
  CaptureEventEmitter emitEvent_;
  std::string trackId_;
  std::string clipId_;
  std::string inputDeviceName_;
  std::vector<float> pendingPeaks_;
  uint64_t lastPeakEmitMs_ = 0;
};

}  // namespace musicapp
