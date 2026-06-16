#include "AudioInputCaptureWorker.h"

#include "InputMeterState.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <condition_variable>

#include <nlohmann/json.hpp>

namespace musicapp {

namespace {

constexpr uint64_t kPeakEmitIntervalMs = 50;
constexpr std::size_t kPeaksPerEmit = 8;

uint64_t steadyNowMs() {
  return static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::milliseconds>(
          std::chrono::steady_clock::now().time_since_epoch())
          .count());
}

float safePeak(float value) {
  return std::clamp(std::isfinite(value) ? value : 0.0f, 0.0f, 1.0f);
}

}  // namespace

AudioInputCaptureWorker::~AudioInputCaptureWorker() {
  stop();
}

void AudioInputCaptureWorker::start(AudioInputCaptureWorkerConfig config) {
  stop();
  {
    std::lock_guard<std::mutex> lock(mutex_);
    writer_ = config.writer;
    emitEvent_ = std::move(config.emitEvent);
    trackId_ = std::move(config.trackId);
    clipId_ = std::move(config.clipId);
    inputDeviceName_ = std::move(config.inputDeviceName);
    pendingPeaks_.clear();
    queue_.clear();
    lastPeakEmitMs_ = 0;
    samplesWritten_.store(0, std::memory_order_relaxed);
    accepting_.store(writer_ != nullptr, std::memory_order_release);
  }
  if (accepting_.load(std::memory_order_acquire)) {
    thread_ = std::thread([this] { run(); });
  }
}

void AudioInputCaptureWorker::stop() {
  accepting_.store(false, std::memory_order_release);
  ready_.notify_one();
  if (thread_.joinable()) {
    thread_.join();
  }

  std::lock_guard<std::mutex> lock(mutex_);
  queue_.clear();
  pendingPeaks_.clear();
  writer_ = nullptr;
  emitEvent_ = nullptr;
  trackId_.clear();
  clipId_.clear();
  inputDeviceName_.clear();
}

bool AudioInputCaptureWorker::isRunning() const {
  return accepting_.load(std::memory_order_acquire);
}

juce::int64 AudioInputCaptureWorker::samplesWritten() const {
  return samplesWritten_.load(std::memory_order_relaxed);
}

void AudioInputCaptureWorker::enqueue(
    const float* const* inputChannelData,
    int numInputChannels,
    int numSamples) {
  if (!isRunning() || inputChannelData == nullptr || numInputChannels <= 0 || numSamples <= 0) {
    return;
  }

  CaptureBlock block;
  block.numChannels = std::max(1, std::min(2, numInputChannels));
  block.numInputChannels = numInputChannels;
  block.numSamples = numSamples;
  block.samples.resize(static_cast<std::size_t>(block.numChannels * block.numSamples));

  for (int channel = 0; channel < block.numChannels; ++channel) {
    auto* destination = block.samples.data() + static_cast<std::size_t>(channel * block.numSamples);
    const float* source = inputChannelData[channel];
    if (source == nullptr) {
      std::fill(destination, destination + block.numSamples, 0.0f);
      continue;
    }
    std::copy(source, source + block.numSamples, destination);
    for (int sample = 0; sample < block.numSamples; ++sample) {
      block.peak = std::max(block.peak, std::abs(source[sample]));
    }
  }

  for (int channel = block.numChannels; channel < numInputChannels; ++channel) {
    const float* source = inputChannelData[channel];
    if (source == nullptr) {
      continue;
    }
    for (int sample = 0; sample < block.numSamples; ++sample) {
      block.peak = std::max(block.peak, std::abs(source[sample]));
    }
  }

  {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!accepting_.load(std::memory_order_acquire)) {
      return;
    }
    queue_.push_back(std::move(block));
  }
  ready_.notify_one();
}

void AudioInputCaptureWorker::run() {
  for (;;) {
    CaptureBlock block;
    {
      std::unique_lock<std::mutex> lock(mutex_);
      ready_.wait(lock, [this] {
        return !queue_.empty() || !accepting_.load(std::memory_order_acquire);
      });
      if (queue_.empty()) {
        if (!accepting_.load(std::memory_order_acquire)) {
          break;
        }
        continue;
      }
      block = std::move(queue_.front());
      queue_.pop_front();
    }

    writeBlock(block);
    recordBlockPeak(block);
  }

  flushPendingPeaks();
}

void AudioInputCaptureWorker::writeBlock(CaptureBlock& block) {
  if (writer_ == nullptr || block.numChannels <= 0 || block.numSamples <= 0) {
    return;
  }

  std::array<float*, 2> channelData{};
  for (int channel = 0; channel < block.numChannels; ++channel) {
    channelData[static_cast<std::size_t>(channel)] =
        block.samples.data() + static_cast<std::size_t>(channel * block.numSamples);
  }
  juce::AudioBuffer<float> buffer(channelData.data(), block.numChannels, block.numSamples);
  writer_->writeFromAudioSampleBuffer(buffer, 0, block.numSamples);
  samplesWritten_.fetch_add(block.numSamples, std::memory_order_relaxed);
}

void AudioInputCaptureWorker::recordBlockPeak(const CaptureBlock& block) {
  const float peak = safePeak(block.peak);
  recordInputMeterPeak(peak, block.numInputChannels, inputDeviceName_);
  if (!emitEvent_) {
    return;
  }

  pendingPeaks_.push_back(peak);
  const uint64_t now = steadyNowMs();
  if (pendingPeaks_.size() < kPeaksPerEmit && now - lastPeakEmitMs_ < kPeakEmitIntervalMs) {
    return;
  }
  flushPendingPeaks();
}

void AudioInputCaptureWorker::flushPendingPeaks() {
  if (!emitEvent_ || pendingPeaks_.empty()) {
    return;
  }

  nlohmann::json payload;
  payload["event"] = "audioInputPeaks";
  payload["trackId"] = trackId_;
  payload["clipId"] = clipId_;
  payload["isRecording"] = true;
  payload["peaks"] = pendingPeaks_;
  pendingPeaks_.clear();
  lastPeakEmitMs_ = steadyNowMs();
  emitEvent_("onRecordingUpdate", payload.dump());
}

}  // namespace musicapp
