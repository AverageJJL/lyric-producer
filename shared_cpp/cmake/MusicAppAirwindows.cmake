# MIT-licensed Airwindows DSP (subset via airwin2rack autogen sources).
# Do NOT add src-juce, src-rack, or full airwin-registry — those pull GPL toolchains.

include(FetchContent)

set(MUSICAPP_AIRWIN2RACK_GIT_TAG "6448ef21972843b741a97f4ddaff5fcc8ab8926d" CACHE STRING
    "Pinned airwin2rack commit for MusicApp FX")

FetchContent_Declare(
  musicapp_airwin2rack
  GIT_REPOSITORY https://github.com/baconpaul/airwin2rack.git
  GIT_TAG ${MUSICAPP_AIRWIN2RACK_GIT_TAG}
)
# Populate sources only — never add_subdirectory(airwin2rack): its CMake pulls GPL Rack/JUCE targets.
FetchContent_GetProperties(musicapp_airwin2rack)
if(NOT musicapp_airwin2rack_POPULATED)
  FetchContent_Populate(musicapp_airwin2rack)
endif()

set(MUSICAPP_AIRWIN_SRC "${musicapp_airwin2rack_SOURCE_DIR}/src")
set(MUSICAPP_AIRWIN_AUTOGEN "${MUSICAPP_AIRWIN_SRC}/autogen_airwin")

set(MUSICAPP_AIRWIN_EFFECT_SOURCES
  ${MUSICAPP_AIRWIN_SRC}/airwin_consolidated_base.cpp
  ${MUSICAPP_AIRWIN_AUTOGEN}/Parametric.cpp
  ${MUSICAPP_AIRWIN_AUTOGEN}/ParametricProc.cpp
  ${MUSICAPP_AIRWIN_AUTOGEN}/Logical4.cpp
  ${MUSICAPP_AIRWIN_AUTOGEN}/Logical4Proc.cpp
  ${MUSICAPP_AIRWIN_AUTOGEN}/MatrixVerb.cpp
  ${MUSICAPP_AIRWIN_AUTOGEN}/MatrixVerbProc.cpp
  airwindows/MusicAppAirwindowsFactory.cpp
)

add_library(musicapp_airwindows STATIC ${MUSICAPP_AIRWIN_EFFECT_SOURCES})

target_compile_definitions(musicapp_airwindows PRIVATE _USE_MATH_DEFINES)
target_include_directories(musicapp_airwindows
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/airwindows
    ${MUSICAPP_AIRWIN_SRC}
    ${MUSICAPP_AIRWIN_AUTOGEN}
)

if(NOT MSVC)
  target_compile_options(musicapp_airwindows PRIVATE
    -Wno-unused-function
    -Wno-unused-value
    -Wno-unused-but-set-variable
    -Wno-multichar
  )
endif()

if(MSVC)
  target_compile_options(musicapp_airwindows PRIVATE /bigobj)
endif()

target_compile_features(musicapp_airwindows PUBLIC cxx_std_17)
