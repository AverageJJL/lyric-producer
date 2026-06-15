cmake_minimum_required(VERSION 3.20)

project(NativeAudioEngineAddon LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REPLACE "\"" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")

add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../../shared_cpp shared_cpp_build)

add_library(native_audio_engine MODULE NativeAudioEngineAddon.cpp)

set_target_properties(native_audio_engine PROPERTIES
  PREFIX ""
  SUFFIX ".node"
)

target_include_directories(native_audio_engine PRIVATE
  ${CMAKE_JS_INC}
  ${NODE_ADDON_API_DIR}
)

target_compile_definitions(native_audio_engine PRIVATE
  NAPI_CPP_EXCEPTIONS
)

target_link_libraries(native_audio_engine PRIVATE
  ${CMAKE_JS_LIB}
  MusicAppEngine
)

if(APPLE)
  target_link_options(native_audio_engine PRIVATE -undefined dynamic_lookup)
endif()
