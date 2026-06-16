cmake_minimum_required(VERSION 3.22)

project(MusicAppExternalPluginFixture VERSION 1.0.0 LANGUAGES C CXX OBJCXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_subdirectory(
  "${CMAKE_CURRENT_LIST_DIR}/../../shared_cpp/third_party/juce"
  "${CMAKE_BINARY_DIR}/juce"
)

juce_add_plugin(MusicAppExternalFixture
  COMPANY_NAME "MusicApp"
  IS_SYNTH FALSE
  NEEDS_MIDI_INPUT FALSE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS FALSE
  COPY_PLUGIN_AFTER_BUILD FALSE
  PLUGIN_MANUFACTURER_CODE Mapp
  PLUGIN_CODE Mfx1
  FORMATS VST3
  PRODUCT_NAME "MusicApp External Fixture"
)

target_sources(MusicAppExternalFixture
  PRIVATE
    PluginProcessor.cpp
)

target_compile_definitions(MusicAppExternalFixture
  PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(MusicAppExternalFixture
  PRIVATE
    juce::juce_audio_utils
  PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_warning_flags
)
