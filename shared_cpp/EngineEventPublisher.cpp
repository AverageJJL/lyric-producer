#include "EngineEventPublisher.h"

#include "AudioEngineController.h"

#include <nlohmann/json.hpp>

#include <atomic>
#include <chrono>
#include <memory>
#include <mutex>
#include <thread>

namespace musicapp {

class EngineEventPublisher::Impl {
 public:
  Impl(AudioEngineController& controller, EngineTaskPoster postToEngineThread)
      : state_(std::make_shared<State>(controller, std::move(postToEngineThread))) {}

  void start() {
    if (state_->running.exchange(true)) {
      return;
    }

    state_->timerThread = std::thread([state = state_] {
      while (state->running) {
        std::this_thread::sleep_for(std::chrono::milliseconds(33));
        if (!state->running || state->publishQueued.exchange(true)) {
          continue;
        }

        state->postToEngineThread([state] {
          if (!state->running) {
            state->publishQueued = false;
            return;
          }

          publishTransportUpdate(state);
          publishMeterUpdate(state);
          state->publishQueued = false;
        });
      }
    });
  }

  void stop() {
    if (!state_->running.exchange(false)) {
      return;
    }
    if (state_->timerThread.joinable()) {
      state_->timerThread.join();
    }
  }

  void setCallback(std::function<void(const std::string&, const std::string&)> callback) {
    std::lock_guard<std::mutex> lock(state_->callbackMutex);
    state_->callback = std::move(callback);
  }

 private:
  struct State {
    State(AudioEngineController& controller, EngineTaskPoster postToEngineThread)
        : controller(controller), postToEngineThread(std::move(postToEngineThread)) {}

    AudioEngineController& controller;
    EngineTaskPoster postToEngineThread;
    std::function<void(const std::string&, const std::string&)> callback;
    std::mutex callbackMutex;
    std::atomic<bool> running{false};
    std::atomic<bool> publishQueued{false};
    std::thread timerThread;
  };

  std::shared_ptr<State> state_;

  static void publishTransportUpdate(const std::shared_ptr<State>& state) {
    std::function<void(const std::string&, const std::string&)> callback;
    {
      std::lock_guard<std::mutex> lock(state->callbackMutex);
      callback = state->callback;
    }

    if (!callback || !state->running) {
      return;
    }

    const auto statusJson = state->controller.getTransportStatusJson();
    nlohmann::json payload = nlohmann::json::parse(statusJson, nullptr, false);
    if (payload.is_discarded()) {
      payload = nlohmann::json::object();
    }

    payload["event"] = "transportUpdate";
    callback("onTransportUpdate", payload.dump());
  }

  static void publishMeterUpdate(const std::shared_ptr<State>& state) {
    std::function<void(const std::string&, const std::string&)> callback;
    {
      std::lock_guard<std::mutex> lock(state->callbackMutex);
      callback = state->callback;
    }

    if (!callback || !state->running) {
      return;
    }

    callback("onMixMeterUpdate", state->controller.getMeterSnapshotJson());
  }
};

EngineEventPublisher::EngineEventPublisher(
    AudioEngineController& controller,
    EngineTaskPoster postToEngineThread)
    : impl_(std::make_unique<Impl>(controller, std::move(postToEngineThread))) {}

EngineEventPublisher::~EngineEventPublisher() {
  stop();
}

void EngineEventPublisher::start() {
  impl_->start();
}

void EngineEventPublisher::stop() {
  impl_->stop();
}

void EngineEventPublisher::setCallback(
    std::function<void(const std::string&, const std::string&)> callback) {
  impl_->setCallback(std::move(callback));
}

}  // namespace musicapp
