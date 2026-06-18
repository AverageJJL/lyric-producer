#include "AskMeasurementDsp.h"

#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_dsp/juce_dsp.h>

#include <algorithm>
#include <cmath>
#include <memory>

namespace musicapp {

double askLinToDb(double value) {
  return value > 1.0e-12 ? 10.0 * std::log10(value) : kAskSilenceDb;
}

double askAmpToDb(double amp) {
  return amp > 1.0e-12 ? 20.0 * std::log10(amp) : kAskSilenceDb;
}

namespace {

std::vector<float> resampleLinear(const std::vector<float>& in, double srcRate, double dstRate) {
  if (in.empty() || srcRate <= 0.0 || std::abs(srcRate - dstRate) < 1.0) {
    return in;
  }
  const double ratio = dstRate / srcRate;
  const int outLength = std::max(1, static_cast<int>(std::ceil(static_cast<double>(in.size()) * ratio)));
  std::vector<float> out(static_cast<std::size_t>(outLength), 0.0f);
  for (int i = 0; i < outLength; ++i) {
    const double srcPos = static_cast<double>(i) / ratio;
    const int idx = static_cast<int>(srcPos);
    const float frac = static_cast<float>(srcPos - static_cast<double>(idx));
    const float a = in[static_cast<std::size_t>(std::min<int>(idx, static_cast<int>(in.size()) - 1))];
    const float b = in[static_cast<std::size_t>(std::min<int>(idx + 1, static_cast<int>(in.size()) - 1))];
    out[static_cast<std::size_t>(i)] = a + frac * (b - a);
  }
  return out;
}

/** Transposed-direct-form-II biquad (one ITU-R BS.1770 K-weighting stage). */
struct Biquad {
  double b0, b1, b2, a1, a2;
  double z1 = 0.0, z2 = 0.0;
  double process(double x) {
    const double y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  }
};

double windowLoudness(const std::vector<double>& squares, std::size_t start, std::size_t count) {
  if (count == 0 || start >= squares.size()) {
    return kAskSilenceDb;
  }
  const std::size_t end = std::min(squares.size(), start + count);
  double sum = 0.0;
  for (std::size_t i = start; i < end; ++i) {
    sum += squares[i];
  }
  return -0.691 + askLinToDb(sum / static_cast<double>(end - start));
}

std::vector<float> hann(int size) {
  std::vector<float> window(static_cast<std::size_t>(size), 0.0f);
  for (int i = 0; i < size; ++i) {
    window[static_cast<std::size_t>(i)] = 0.5f
        * (1.0f - std::cos(2.0f * juce::MathConstants<float>::pi * static_cast<float>(i)
                           / static_cast<float>(size - 1)));
  }
  return window;
}

}  // namespace

AskAudioSegment readAudioSegment(const juce::File& file, const AskSegmentRequest& request) {
  AskAudioSegment seg;
  juce::AudioFormatManager formatManager;
  formatManager.registerBasicFormats();
  std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(file));
  if (reader == nullptr || reader->lengthInSamples <= 0 || reader->sampleRate <= 0.0) {
    return seg;
  }
  const int channels = std::max(1, static_cast<int>(reader->numChannels));
  const int totalSamples = static_cast<int>(reader->lengthInSamples);
  const double sampleRate = reader->sampleRate;

  const int startSample = std::clamp(static_cast<int>(std::llround(request.startSeconds * sampleRate)), 0, totalSamples);
  int count = request.durationSeconds > 0.0
      ? static_cast<int>(std::llround(request.durationSeconds * sampleRate))
      : totalSamples - startSample;
  count = std::clamp(count, 0, totalSamples - startSample);
  if (count <= 0) {
    return seg;
  }

  juce::AudioBuffer<float> buffer(channels, count);
  buffer.clear();
  reader->read(&buffer, 0, count, startSample, true, true);

  const double gain = std::pow(10.0, request.gainDb / 20.0);
  const int fadeIn = std::clamp(static_cast<int>(std::llround(request.fadeInSeconds * sampleRate)), 0, count);
  const int fadeOut = std::clamp(static_cast<int>(std::llround(request.fadeOutSeconds * sampleRate)), 0, count);

  seg.channels.assign(static_cast<std::size_t>(channels), std::vector<float>(static_cast<std::size_t>(count), 0.0f));
  seg.sampleRate = sampleRate;
  for (int ch = 0; ch < channels; ++ch) {
    const float* src = buffer.getReadPointer(ch);
    std::vector<float>& dst = seg.channels[static_cast<std::size_t>(ch)];
    for (int i = 0; i < count; ++i) {
      dst[static_cast<std::size_t>(i)] = static_cast<float>(static_cast<double>(src[i]) * gain);
    }
    // Reverse FIRST, then apply fades on the audible timeline (fade-in at the start, fade-out
    // at the end of what is heard) — matching playback, which reverses the source cache and
    // then fades the reversed clip.
    if (request.reversed) {
      std::reverse(dst.begin(), dst.end());
    }
    for (int i = 0; i < fadeIn; ++i) {
      dst[static_cast<std::size_t>(i)] *= static_cast<float>(static_cast<double>(i) / static_cast<double>(fadeIn));
    }
    for (int i = 0; i < fadeOut; ++i) {
      dst[static_cast<std::size_t>(count - 1 - i)] *= static_cast<float>(static_cast<double>(i) / static_cast<double>(fadeOut));
    }
  }
  double peak = 0.0;
  for (const std::vector<float>& channel : seg.channels) {
    for (float value : channel) {
      peak = std::max(peak, std::abs(static_cast<double>(value)));
    }
  }
  seg.peak = peak;
  seg.ok = true;
  return seg;
}

double channelRms(const std::vector<std::vector<float>>& channels) {
  double sumOfChannelPower = 0.0;
  int counted = 0;
  for (const std::vector<float>& channel : channels) {
    if (channel.empty()) {
      continue;
    }
    double sumSquares = 0.0;
    for (float value : channel) {
      sumSquares += static_cast<double>(value) * static_cast<double>(value);
    }
    sumOfChannelPower += sumSquares / static_cast<double>(channel.size());
    ++counted;
  }
  return counted > 0 ? std::sqrt(sumOfChannelPower / static_cast<double>(counted)) : 0.0;
}

std::vector<double> kWeightedChannelSquares(const std::vector<std::vector<float>>& channels, double sampleRate) {
  std::vector<double> squares;
  for (const std::vector<float>& channel : channels) {
    const std::vector<float> resampled = resampleLinear(channel, sampleRate, 48000.0);
    // Canonical BS.1770 / libebur128 coefficients for 48 kHz (stage 1 shelf, stage 2 HPF).
    Biquad shelf{1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585, 0.0, 0.0};
    Biquad highpass{1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621, 0.0, 0.0};
    if (squares.empty()) {
      squares.assign(resampled.size(), 0.0);
    }
    const std::size_t n = std::min(squares.size(), resampled.size());
    for (std::size_t i = 0; i < n; ++i) {
      const double weighted = highpass.process(shelf.process(static_cast<double>(resampled[i])));
      squares[i] += weighted * weighted;
    }
  }
  return squares;
}

/** Gated integrated loudness (LUFS) over 400 ms / 75%-overlap blocks. */
double integratedLufs(const std::vector<double>& squares) {
  const std::size_t block = 19200;  // 400 ms @ 48 kHz
  const std::size_t step = 4800;    // 100 ms hop
  if (squares.size() < block) {
    return windowLoudness(squares, 0, squares.size());
  }
  std::vector<double> blockMeanSquare;
  for (std::size_t start = 0; start + block <= squares.size(); start += step) {
    double sum = 0.0;
    for (std::size_t i = start; i < start + block; ++i) {
      sum += squares[i];
    }
    blockMeanSquare.push_back(sum / static_cast<double>(block));
  }
  auto gatedMean = [&](double thresholdLufs) {
    double sum = 0.0;
    std::size_t kept = 0;
    for (double ms : blockMeanSquare) {
      if (-0.691 + askLinToDb(ms) >= thresholdLufs) {
        sum += ms;
        ++kept;
      }
    }
    return kept > 0 ? sum / static_cast<double>(kept) : 0.0;
  };
  const double absGatedMean = gatedMean(-70.0);
  const double relativeThreshold = -0.691 + askLinToDb(absGatedMean) - 10.0;
  const double finalMean = gatedMean(relativeThreshold);
  return -0.691 + askLinToDb(finalMean);
}

double loudestWindow(const std::vector<double>& squares, std::size_t windowSamples) {
  if (squares.size() <= windowSamples) {
    return windowLoudness(squares, 0, squares.size());
  }
  const std::size_t step = 48000;  // 1 s
  double loudest = kAskSilenceDb;
  for (std::size_t start = 0; start + windowSamples <= squares.size(); start += step) {
    loudest = std::max(loudest, windowLoudness(squares, start, windowSamples));
  }
  return loudest;
}

/** Third-octave-spaced bands from 20 Hz up to just under Nyquist. */
std::vector<AskBandEdge> buildBands(double sampleRate) {
  const double nyquist = sampleRate * 0.5;
  std::vector<AskBandEdge> bands;
  double low = 20.0;
  while (low < nyquist && bands.size() < 31) {
    const double high = std::min(low * std::pow(2.0, 1.0 / 3.0), nyquist);
    if (high <= low) {
      break;
    }
    bands.push_back({low, high});
    low = high;
  }
  return bands;
}

AskSpectrum computeBandSpectrum(
    const std::vector<std::vector<float>>& channels,
    double sampleRate,
    const std::vector<AskBandEdge>& bands) {
  AskSpectrum result;
  result.meanEnergy.assign(bands.size(), 0.0);

  constexpr int fftOrder = 11;
  constexpr int fftSize = 1 << fftOrder;
  constexpr int hop = fftSize / 4;
  const int fftBins = fftSize / 2 + 1;

  juce::dsp::FFT fft(fftOrder);
  const std::vector<float> window = hann(fftSize);
  std::vector<float> fftData(static_cast<std::size_t>(fftSize * 2), 0.0f);
  std::vector<double> bandEnergy(bands.size(), 0.0);
  long long frameAccum = 0;
  double totalPower = 0.0;

  // Sum power across channels per band so hard-panned / out-of-phase energy is preserved.
  for (const std::vector<float>& channel : channels) {
    for (std::size_t start = 0; start + static_cast<std::size_t>(fftSize) <= channel.size();
         start += static_cast<std::size_t>(hop)) {
      std::fill(fftData.begin(), fftData.end(), 0.0f);
      for (int i = 0; i < fftSize; ++i) {
        fftData[static_cast<std::size_t>(i)] = channel[start + static_cast<std::size_t>(i)] * window[static_cast<std::size_t>(i)];
      }
      fft.performFrequencyOnlyForwardTransform(fftData.data());
      for (int bin = 1; bin < fftBins; ++bin) {
        const double freq = static_cast<double>(bin) * sampleRate / static_cast<double>(fftSize);
        const double power = static_cast<double>(fftData[static_cast<std::size_t>(bin)])
                             * static_cast<double>(fftData[static_cast<std::size_t>(bin)]);
        totalPower += power;
        for (std::size_t b = 0; b < bands.size(); ++b) {
          if (freq >= bands[b].lowHz && freq < bands[b].highHz) {
            bandEnergy[b] += power;
            break;
          }
        }
      }
      ++frameAccum;
    }
  }

  result.frames = static_cast<int>(frameAccum);
  const double denom = static_cast<double>(std::max<long long>(1, frameAccum));
  for (std::size_t b = 0; b < bands.size(); ++b) {
    result.meanEnergy[b] = bandEnergy[b] / denom;
  }
  result.integratedRmsDb = askAmpToDb(std::sqrt(totalPower / std::max(1.0, denom * static_cast<double>(fftBins))));
  return result;
}

}  // namespace musicapp
