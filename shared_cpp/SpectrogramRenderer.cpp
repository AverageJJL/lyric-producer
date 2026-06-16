#include "SpectrogramRenderer.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_dsp/juce_dsp.h>
#include <juce_graphics/juce_graphics.h>

#include <algorithm>
#include <cmath>
#include <vector>

namespace musicapp {

namespace {

constexpr int kFftOrder = 11;
constexpr int kFftSize = 1 << kFftOrder;
constexpr int kHopSize = kFftSize / 4;
constexpr int kMelBands = 80;
constexpr double kMinHz = 80.0;
constexpr double kMaxHz = 8000.0;
constexpr double kTargetSampleRate = 22050.0;

double hzToMel(double hz) {
  return 2595.0 * std::log10(1.0 + hz / 700.0);
}

double melToHz(double mel) {
  return 700.0 * (std::pow(10.0, mel / 2595.0) - 1.0);
}

std::vector<std::vector<float>> buildMelFilterbank(int fftBins, double sampleRate) {
  const double melMin = hzToMel(kMinHz);
  const double melMax = hzToMel(std::min(kMaxHz, sampleRate * 0.5));
  std::vector<double> melPoints(static_cast<std::size_t>(kMelBands + 2));
  for (int i = 0; i < kMelBands + 2; ++i) {
    const double t = static_cast<double>(i) / static_cast<double>(kMelBands + 1);
    melPoints[static_cast<std::size_t>(i)] = melMin + t * (melMax - melMin);
  }

  std::vector<int> binEdges(melPoints.size());
  for (std::size_t i = 0; i < melPoints.size(); ++i) {
    const double hz = melToHz(melPoints[i]);
    binEdges[i] = static_cast<int>(
        std::floor((fftBins - 1) * 2.0 * hz / sampleRate));
    binEdges[i] = std::clamp(binEdges[i], 0, fftBins - 1);
  }

  std::vector<std::vector<float>> bank(static_cast<std::size_t>(kMelBands));
  for (int band = 0; band < kMelBands; ++band) {
    bank[static_cast<std::size_t>(band)].assign(static_cast<std::size_t>(fftBins), 0.0f);
    const int left = binEdges[static_cast<std::size_t>(band)];
    const int center = binEdges[static_cast<std::size_t>(band) + 1];
    const int right = binEdges[static_cast<std::size_t>(band) + 2];
    if (center <= left || right <= center) {
      continue;
    }
    for (int bin = left; bin < center; ++bin) {
      bank[static_cast<std::size_t>(band)][static_cast<std::size_t>(bin)] =
          static_cast<float>(bin - left) / static_cast<float>(center - left);
    }
    for (int bin = center; bin < right; ++bin) {
      bank[static_cast<std::size_t>(band)][static_cast<std::size_t>(bin)] =
          static_cast<float>(right - bin) / static_cast<float>(right - center);
    }
  }
  return bank;
}

std::vector<float> readMonoResampled(const juce::File& wavFile, double& outSampleRate) {
  juce::AudioFormatManager formatManager;
  formatManager.registerBasicFormats();
  std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(wavFile));
  if (reader == nullptr || reader->lengthInSamples <= 0) {
    return {};
  }

  const int channels = static_cast<int>(reader->numChannels);
  const juce::int64 totalSamples = reader->lengthInSamples;
  const double sourceRate = reader->sampleRate;
  outSampleRate = sourceRate;

  juce::AudioBuffer<float> buffer(channels, static_cast<int>(totalSamples));
  reader->read(&buffer, 0, static_cast<int>(totalSamples), 0, true, true);

  std::vector<float> mono(static_cast<std::size_t>(totalSamples), 0.0f);
  for (int i = 0; i < totalSamples; ++i) {
    float sum = 0.0f;
    for (int ch = 0; ch < channels; ++ch) {
      sum += buffer.getSample(ch, i);
    }
    mono[static_cast<std::size_t>(i)] = sum / static_cast<float>(channels);
  }

  if (std::abs(sourceRate - kTargetSampleRate) < 1.0) {
    outSampleRate = sourceRate;
    return mono;
  }

  const double ratio = kTargetSampleRate / sourceRate;
  const int outLength = static_cast<int>(std::max<juce::int64>(
      1, static_cast<juce::int64>(std::ceil(static_cast<double>(totalSamples) * ratio))));
  std::vector<float> resampled(static_cast<std::size_t>(outLength), 0.0f);
  for (int i = 0; i < outLength; ++i) {
    const double srcPos = static_cast<double>(i) / ratio;
    const int idx = static_cast<int>(srcPos);
    const float frac = static_cast<float>(srcPos - static_cast<double>(idx));
    const float a = mono[static_cast<std::size_t>(std::min<juce::int64>(idx, totalSamples - 1))];
    const float b = mono[static_cast<std::size_t>(
        std::min<juce::int64>(idx + 1, totalSamples - 1))];
    resampled[static_cast<std::size_t>(i)] = a + frac * (b - a);
  }
  outSampleRate = kTargetSampleRate;
  return resampled;
}

uint8_t magnitudeToGray(float value, float floorDb, float ceilDb) {
  const float db = 20.0f * std::log10(std::max(value, 1.0e-8f));
  const float norm = (db - floorDb) / (ceilDb - floorDb);
  const float clamped = std::clamp(norm, 0.0f, 1.0f);
  return static_cast<uint8_t>(clamped * 255.0f);
}

std::vector<float> hannWindow(int size) {
  std::vector<float> window(static_cast<std::size_t>(size), 0.0f);
  for (int i = 0; i < size; ++i) {
    window[static_cast<std::size_t>(i)] = 0.5f
        * (1.0f - std::cos(2.0f * juce::MathConstants<float>::pi * static_cast<float>(i)
                           / static_cast<float>(size - 1)));
  }
  return window;
}

}  // namespace

bool renderMelSpectrogramPng(
    const juce::File& wavFile,
    const juce::File& pngOut,
    int width,
    int height,
    std::string& errorOut) {
  width = std::clamp(width, 64, 2048);
  height = std::clamp(height, 64, 2048);

  double sampleRate = 0.0;
  const std::vector<float> mono = readMonoResampled(wavFile, sampleRate);
  if (mono.empty() || sampleRate <= 0.0) {
    errorOut = "Could not read audio file.";
    return false;
  }

  const int fftBins = kFftSize / 2 + 1;
  const auto melBank = buildMelFilterbank(fftBins, sampleRate);

  juce::dsp::FFT fft(kFftOrder);
  const auto window = hannWindow(kFftSize);
  std::vector<float> frame(static_cast<std::size_t>(kFftSize), 0.0f);
  std::vector<float> fftData(static_cast<std::size_t>(kFftSize * 2), 0.0f);
  std::vector<float> magnitudes(static_cast<std::size_t>(fftBins), 0.0f);

  const int frameCount = std::max(
      1,
      static_cast<int>((mono.size() - static_cast<std::size_t>(kFftSize)) / kHopSize) + 1);
  std::vector<float> melFrames(static_cast<std::size_t>(frameCount * kMelBands), 0.0f);

  for (int frameIndex = 0; frameIndex < frameCount; ++frameIndex) {
    const int start = frameIndex * kHopSize;
    std::fill(frame.begin(), frame.end(), 0.0f);
    for (int i = 0; i < kFftSize; ++i) {
      const int sampleIndex = start + i;
      if (sampleIndex >= 0 && sampleIndex < static_cast<int>(mono.size())) {
        frame[static_cast<std::size_t>(i)] = mono[static_cast<std::size_t>(sampleIndex)];
      }
      frame[static_cast<std::size_t>(i)] *= window[static_cast<std::size_t>(i)];
    }
    std::fill(fftData.begin(), fftData.end(), 0.0f);
    std::copy(frame.begin(), frame.end(), fftData.begin());
    fft.performFrequencyOnlyForwardTransform(fftData.data());

    for (int bin = 0; bin < fftBins; ++bin) {
      magnitudes[static_cast<std::size_t>(bin)] = fftData[static_cast<std::size_t>(bin)];
    }

    for (int band = 0; band < kMelBands; ++band) {
      float energy = 0.0f;
      for (int bin = 0; bin < fftBins; ++bin) {
        energy += magnitudes[static_cast<std::size_t>(bin)]
                  * melBank[static_cast<std::size_t>(band)][static_cast<std::size_t>(bin)];
      }
      melFrames[static_cast<std::size_t>(frameIndex * kMelBands + band)] = energy;
    }
  }

  float globalMax = 1.0e-8f;
  for (float value : melFrames) {
    globalMax = std::max(globalMax, value);
  }
  const float floorDb = 20.0f * std::log10(globalMax) - 80.0f;
  const float ceilDb = 20.0f * std::log10(globalMax);

  juce::Image image(juce::Image::RGB, width, height, true);
  juce::Image::BitmapData bitmap(image, juce::Image::BitmapData::writeOnly);
  std::vector<int> frameByX(static_cast<std::size_t>(width), 0);
  for (int x = 0; x < width; ++x) {
    frameByX[static_cast<std::size_t>(x)] = std::clamp(
        static_cast<int>(static_cast<double>(x) / static_cast<double>(width - 1)
                         * static_cast<double>(frameCount - 1)),
        0,
        frameCount - 1);
  }
  std::vector<int> bandByY(static_cast<std::size_t>(height), 0);
  for (int y = 0; y < height; ++y) {
    bandByY[static_cast<std::size_t>(y)] = std::clamp(
        static_cast<int>((1.0 - static_cast<double>(y) / static_cast<double>(height - 1))
                         * static_cast<double>(kMelBands - 1)),
        0,
        kMelBands - 1);
  }

  for (int y = 0; y < height; ++y) {
    const int melBand = bandByY[static_cast<std::size_t>(y)];
    uint8_t* pixel = bitmap.getPixelPointer(0, y);
    for (int x = 0; x < width; ++x) {
      const int frameIdx = frameByX[static_cast<std::size_t>(x)];
      const float value = melFrames[static_cast<std::size_t>(frameIdx * kMelBands + melBand)];
      const uint8_t gray = magnitudeToGray(value, floorDb, ceilDb);
      if (bitmap.pixelStride >= 3) {
        pixel[0] = gray;
        pixel[1] = gray;
        pixel[2] = gray;
        if (bitmap.pixelStride == 4) {
          pixel[3] = 255;
        }
      } else {
        bitmap.setPixelColour(x, y, juce::Colour(gray, gray, gray));
      }
      pixel += bitmap.pixelStride;
    }
  }

  if (!pngOut.getParentDirectory().createDirectory()) {
    errorOut = "Could not create spectrogram output directory.";
    return false;
  }

  std::unique_ptr<juce::FileOutputStream> stream(pngOut.createOutputStream());
  if (stream == nullptr || !stream->openedOk()) {
    errorOut = "Could not open PNG output file.";
    return false;
  }

  juce::PNGImageFormat png;
  if (!png.writeImageToStream(image, *stream)) {
    errorOut = "Failed to encode PNG.";
    return false;
  }

  return true;
}

}  // namespace musicapp
