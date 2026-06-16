#include "AudioEngine.h"

#include "AudioEngineController.h"
#include "CommandDispatcher.h"
#include "JsonResponse.h"

namespace musicapp {

AudioEngine::AudioEngine()
    : controller_(std::make_unique<AudioEngineController>()),
      dispatcher_(std::make_unique<CommandDispatcher>(*controller_)) {}

AudioEngine::~AudioEngine() = default;

void AudioEngine::ensureInitialized() {
  if (autoInitialized_) {
    return;
  }

  controller_->initialize();
  autoInitialized_ = true;
}

std::string AudioEngine::processCommand(std::string command, std::string payload) {
  if (command != "engine_init" && command != "engine_shutdown") {
    ensureInitialized();
  }

  if (command == "engine_init" || command == "engine_shutdown" || command == "engine_status") {
    const auto result = dispatcher_->dispatch(command, payload);
    return commandResultToJson(result);
  }

  return controller_->dispatchCommand(command, payload);
}

void AudioEngine::setEventCallback(EngineEventCallback callback) {
  controller_->setEventCallback(std::move(callback));
}

}  // namespace musicapp
