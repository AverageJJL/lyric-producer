#pragma once

#include <juce_core/juce_core.h>

#include <string>

namespace musicapp {

/** Offline mel spectrogram → PNG for AI multimodal handoff (Phase 1.3). */
bool renderMelSpectrogramPng(
    const juce::File& wavFile,
    const juce::File& pngOut,
    int width,
    int height,
    std::string& errorOut);

}  // namespace musicapp
