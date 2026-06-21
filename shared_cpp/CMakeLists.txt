cmake_minimum_required(VERSION 3.20)

project(MusicAppEngine VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(MUSICAPP_BUILD_TESTS "Build MusicAppEngine tests" OFF)
option(
  MUSICAPP_ENABLE_EXTERNAL_PLUGIN_HOSTING
  "Compile JUCE AU/VST3 host format support for external plugin instantiation work"
  OFF
)

set(MUSICAPP_EXTERNAL_PLUGIN_HOSTING_VALUE 0)
set(MUSICAPP_PLUGINHOST_AU_VALUE 0)
set(MUSICAPP_PLUGINHOST_VST3_VALUE 0)

if(MUSICAPP_ENABLE_EXTERNAL_PLUGIN_HOSTING)
  enable_language(C)
  set(MUSICAPP_EXTERNAL_PLUGIN_HOSTING_VALUE 1)
  set(MUSICAPP_PLUGINHOST_VST3_VALUE 1)
  if(APPLE)
    enable_language(OBJCXX)
    set(MUSICAPP_PLUGINHOST_AU_VALUE 1)
  endif()
endif()

if(MSVC)
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

include(FetchContent)
FetchContent_Declare(
  nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(nlohmann_json)

set(JUCE_MODULES_ONLY ON CACHE BOOL "" FORCE)
set(JUCE_ENABLE_MODULE_SOURCE_GROUPS OFF CACHE BOOL "" FORCE)
set(TRACKTION_AIR_WINDOWS 0 CACHE STRING "" FORCE)

add_compile_definitions(
  TRACKTION_AIR_WINDOWS=0
  JUCE_PLUGINHOST_VST=0
  JUCE_PLUGINHOST_VST3=${MUSICAPP_PLUGINHOST_VST3_VALUE}
  JUCE_PLUGINHOST_AU=${MUSICAPP_PLUGINHOST_AU_VALUE}
  JUCE_USE_CURL=0
  JUCE_WEB_BROWSER=0
  JUCE_USE_MP3AUDIOFORMAT=1
)

set(MUSICAPP_SUBMODULE_SETUP_COMMAND "npm run setup:submodules")

if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/third_party/juce/CMakeLists.txt")
  message(FATAL_ERROR
    "JUCE submodule missing. Run from the repo root: ${MUSICAPP_SUBMODULE_SETUP_COMMAND}")
endif()

if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/third_party/tracktion_engine/CMakeLists.txt")
  message(FATAL_ERROR
    "Tracktion Engine submodule missing. Run from the repo root: ${MUSICAPP_SUBMODULE_SETUP_COMMAND}")
endif()

if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/third_party/tracktion_engine/modules/juce/CMakeLists.txt")
  message(FATAL_ERROR
    "Tracktion nested JUCE submodule missing. Run from the repo root: ${MUSICAPP_SUBMODULE_SETUP_COMMAND}")
endif()

# Keep third_party/juce as a checked-out dependency, but let Tracktion build
# against its pinned JUCE submodule to avoid API mismatches.

set(TE_ADD_EXAMPLES OFF CACHE BOOL "" FORCE)
add_subdirectory(third_party/tracktion_engine EXCLUDE_FROM_ALL)

include(cmake/MusicAppTracktionPatches.cmake)
musicapp_apply_tracktion_patches(tracktion_engine)

include(cmake/MusicAppAirwindows.cmake)

add_library(MusicAppEngine STATIC
  AudioEngine.cpp
  AudioEngineController.cpp
  AmpSimCommands.cpp
  ArrangementAudioCommands.cpp
  ArrangementCommandHelpers.cpp
  ArrangementCommands.cpp
  ArrangementDrumStepCommands.cpp
  ArrangementMixCommands.cpp
  InputMeterState.cpp
  InstrumentCommands.cpp
  InstrumentParameterCommands.cpp
  DrumPatternPreview.cpp
  MidiPhrasePreview.cpp
  DrumSampleDuration.cpp
  SamplePreviewHelpers.cpp
  SampleOneShotPlayer.cpp
  SamplerInstrumentCommands.cpp
  AudioInputCapture.cpp
  AudioInputDeviceManager.cpp
  AudioInputRecordingResult.cpp
  AudioInputCaptureWorker.cpp
  PlaybackDeviceRouting.cpp
  PlaybackDeviceSelection.cpp
  PlaybackGraphRouting.cpp
  RoutingGraphCommands.cpp
  WaveformPeaks.cpp
  AskMeasurementCommands.cpp
  AskMeasurementDsp.cpp
  MediaAnalysisCommands.cpp
  MediaPreparationCommands.cpp
  MeterSnapshot.cpp
  MixdownRenderManager.cpp
  SpectrogramRenderer.cpp
  SpectrogramCommands.cpp
  TempoMapCommands.cpp
  TempoSequenceTime.cpp
  TrackAutomation.cpp
  TrackAutomationCaptureCommands.cpp
  TrackGraphSignature.cpp
  TrackOutputRouting.cpp
  TrackRoutingIntrospection.cpp
  TrackSidechainRouting.cpp
  FourOscPresets.cpp
  MusicAppEngineBehaviour.cpp
  MusicAppAmpSimPlugin.cpp
  MusicAppAirwindowsFxPlugin.cpp
  MusicAppGainTrimPlugin.cpp
  MusicAppReverbPlugin.cpp
  MusicAppSamplerPlugin.cpp
  TrackFxCommands.cpp
  TrackFxExternalPluginDescription.cpp
  TrackFxExternalPluginInsert.cpp
  TrackFxExternalPluginProbe.cpp
  TrackFxStateApply.cpp
  TrackFxPluginScan.cpp
  TrackFxPluginScanPaths.cpp
  TrackMixCommands.cpp
  TrackFxJson.cpp
  TrackFxPluginChain.cpp
  TrackFxDefaults.cpp
  TrackFxHostCapabilities.cpp
  fx/AirwindowsFxCatalog.cpp
  fx/AirwindowsFxParamApply.cpp
  ProjectState.cpp
  JuceMessageThread.cpp
  CommandDispatcher.cpp
  EngineEventPublisher.cpp
  TransportBeat.cpp
  JsonResponse.cpp
)

target_include_directories(MusicAppEngine
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
  PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/tracktion_engine/modules
)

target_compile_definitions(MusicAppEngine PRIVATE
  MUSICAPP_HAVE_TRACKTION=1
  JUCE_WEB_BROWSER=0
  JUCE_USE_CURL=0
  JUCE_USE_MP3AUDIOFORMAT=1
  JUCE_MODAL_LOOPS_PERMITTED=0
  JUCE_STRICT_REFCOUNTEDPOINTER=1
  MUSICAPP_ENABLE_EXTERNAL_PLUGIN_HOSTING=${MUSICAPP_EXTERNAL_PLUGIN_HOSTING_VALUE}
  JUCE_PLUGINHOST_VST3=${MUSICAPP_PLUGINHOST_VST3_VALUE}
  JUCE_PLUGINHOST_VST=0
  JUCE_PLUGINHOST_AU=${MUSICAPP_PLUGINHOST_AU_VALUE}
)

target_link_libraries(MusicAppEngine
  PUBLIC
    nlohmann_json::nlohmann_json
  PRIVATE
    musicapp_airwindows
    tracktion::tracktion_core
    tracktion::tracktion_engine
    tracktion::tracktion_graph
    juce::juce_core
    juce::juce_events
    juce::juce_data_structures
    juce::juce_audio_basics
    juce::juce_audio_devices
    juce::juce_audio_formats
    juce::juce_audio_processors
    juce::juce_audio_processors_headless
    juce::juce_dsp
    juce::juce_graphics
)

get_target_property(MUSICAPP_ENGINE_SOURCES MusicAppEngine SOURCES)
if(MUSICAPP_ENGINE_SOURCES)
  list(FILTER MUSICAPP_ENGINE_SOURCES EXCLUDE REGEX "tracktion_engine_airwindows_[0-9]+\\.cpp$")
  list(FILTER MUSICAPP_ENGINE_SOURCES EXCLUDE REGEX "3rd_party[\\\\/]airwindows[\\\\/].*\\.cpp$")
  list(FILTER MUSICAPP_ENGINE_SOURCES EXCLUDE REGEX "3rd_party[\\\\/]airwindows[\\\\/].*\\.h$")
  set_property(TARGET MusicAppEngine PROPERTY SOURCES "${MUSICAPP_ENGINE_SOURCES}")
endif()

file(GLOB_RECURSE TRACKTION_AIRWINDOWS_SOURCES
  "${CMAKE_CURRENT_SOURCE_DIR}/third_party/tracktion_engine/modules/tracktion_engine/3rd_party/airwindows/*.cpp"
  "${CMAKE_CURRENT_SOURCE_DIR}/third_party/tracktion_engine/modules/tracktion_engine/tracktion_engine_airwindows_*.cpp"
)
if(TRACKTION_AIRWINDOWS_SOURCES)
  set_source_files_properties(${TRACKTION_AIRWINDOWS_SOURCES} PROPERTIES HEADER_FILE_ONLY ON)
endif()

if(WIN32)
  target_link_libraries(MusicAppEngine PRIVATE ole32 winmm)
endif()

target_compile_features(MusicAppEngine PUBLIC cxx_std_20)
