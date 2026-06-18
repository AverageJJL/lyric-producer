function(musicapp_apply_tracktion_patches target_name)
  if(NOT TARGET "${target_name}")
    message(FATAL_ERROR "Tracktion target '${target_name}' is not available.")
  endif()

  get_filename_component(_musicapp_shared_cpp_dir "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/.." ABSOLUTE)
  set(_tracktion_module_dir
    "${_musicapp_shared_cpp_dir}/third_party/tracktion_engine/modules/tracktion_engine"
  )
  set(_patch_dir "${CMAKE_CURRENT_BINARY_DIR}/musicapp_tracktion_patches")
  set(_device_manager_source "${_tracktion_module_dir}/playback/tracktion_DeviceManager.cpp")
  set(_playback_source "${_tracktion_module_dir}/tracktion_engine_playback.cpp")
  set(_patched_device_manager "${_patch_dir}/playback/tracktion_DeviceManager.cpp")
  set(_patched_playback "${_patch_dir}/tracktion_engine_playback.cpp")

  file(READ "${_device_manager_source}" _device_manager_content)
  set(_device_manager_unpatched "${_device_manager_content}")

  string(REPLACE
    [=[
void DeviceManager::dispatchPendingUpdates()
{
    handleUpdateNowIfNeeded();
    prepareToStartCaller->handleUpdateNowIfNeeded();
}
]=]
    [=[
void DeviceManager::dispatchPendingUpdates()
{
    // Electron does not run JUCE's standalone message loop, so AsyncUpdater posts
    // can be cleared without delivering the wave-device rebuild. If a valid
    // available-output list is cached but no wave outputs exist, rebuild inline.
    const bool rebuildWasDropped = ! isUpdatePending()
                                && waveOutputs.isEmpty()
                                && lastAvailableWaveDeviceList != nullptr
                                && ! lastAvailableWaveDeviceList->outputs.empty();

    if (rebuildWasDropped)
        handleAsyncUpdate();
    else
        handleUpdateNowIfNeeded();

    prepareToStartCaller->handleUpdateNowIfNeeded();
}
]=]
    _device_manager_content
    "${_device_manager_content}"
  )

  if(_device_manager_content STREQUAL _device_manager_unpatched)
    message(FATAL_ERROR "Unable to apply MusicApp Tracktion device manager patch.")
  endif()

  file(MAKE_DIRECTORY "${_patch_dir}/playback")
  file(WRITE "${_patched_device_manager}" "${_device_manager_content}")
  file(READ "${_playback_source}" _playback_content)
  file(WRITE "${_patched_playback}" "${_playback_content}")

  set(_replaced_playback_source OFF)
  foreach(_source_property SOURCES INTERFACE_SOURCES)
    get_target_property(_tracktion_sources "${target_name}" "${_source_property}")
    if(_tracktion_sources)
      set(_updated_sources)
      foreach(_source IN LISTS _tracktion_sources)
        if(_source MATCHES "tracktion_engine_playback\\.cpp$")
          list(APPEND _updated_sources "${_patched_playback}")
          set(_replaced_playback_source ON)
        else()
          list(APPEND _updated_sources "${_source}")
        endif()
      endforeach()

      if(_source_property STREQUAL "SOURCES")
        list(FILTER _updated_sources EXCLUDE REGEX "tracktion_engine_airwindows_[0-9]+\\.cpp$")
        list(FILTER _updated_sources EXCLUDE REGEX "3rd_party[\\\\/]airwindows[\\\\/].*\\.cpp$")
      endif()

      set_property(TARGET "${target_name}" PROPERTY "${_source_property}" "${_updated_sources}")
    endif()
  endforeach()

  if(NOT _replaced_playback_source)
    message(FATAL_ERROR "Unable to replace Tracktion playback source with MusicApp patched copy.")
  endif()

  target_include_directories("${target_name}" INTERFACE "${_tracktion_module_dir}")
endfunction()
