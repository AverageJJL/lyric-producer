#include <napi.h>

#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <utility>

#include "AudioEngine.h"

namespace {

struct EngineEvent {
  std::string name;
  std::string payload;
};

std::mutex engineMutex;
std::unique_ptr<musicapp::AudioEngine> engine;
std::unique_ptr<Napi::ThreadSafeFunction> eventCallback;

std::string escapeJson(const std::string& value) {
  std::ostringstream escaped;
  for (const char ch : value) {
    if (ch == '\\') {
      escaped << "\\\\";
    } else if (ch == '"') {
      escaped << "\\\"";
    } else {
      escaped << ch;
    }
  }
  return escaped.str();
}

std::string assetRootJson(
    const std::string& readRoot,
    const std::string& writableRoot,
    const std::string& sampleLibraryRoot) {
  return "{\"root\":\"" + escapeJson(readRoot) + "\",\"writableRoot\":\"" +
         escapeJson(writableRoot) + "\",\"sampleLibraryRoot\":\"" +
         escapeJson(sampleLibraryRoot) + "\"}";
}

void installEventCallback() {
  if (!engine || !eventCallback) {
    return;
  }

  engine->setEventCallback([](const std::string& eventName, const std::string& payloadJson) {
    auto* event = new EngineEvent{eventName, payloadJson};
    // Non-blocking so mel spectrogram completion is not stuck behind transport ticks.
    const napi_status status = eventCallback->NonBlockingCall(
        event,
        [](Napi::Env env, Napi::Function callback, EngineEvent* data) {
          callback.Call({
              Napi::String::New(env, data->name),
              Napi::String::New(env, data->payload),
          });
          delete data;
        });

    if (status != napi_ok) {
      delete event;
    }
  });
}

Napi::Value SetEventCallback(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (!info[0].IsFunction()) {
    Napi::TypeError::New(env, "Expected event callback function").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::lock_guard<std::mutex> lock(engineMutex);
  if (eventCallback) {
    eventCallback->Release();
  }

  eventCallback = std::make_unique<Napi::ThreadSafeFunction>(
      Napi::ThreadSafeFunction::New(env, info[0].As<Napi::Function>(), "AudioEngineEvents", 0, 1));
  installEventCallback();
  return env.Undefined();
}

Napi::Value InitEngine(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const std::string readRoot = info[0].As<Napi::String>().Utf8Value();
  const std::string writableRoot = info[1].As<Napi::String>().Utf8Value();
  const std::string sampleLibraryRoot =
      info.Length() > 2 && info[2].IsString() ? info[2].As<Napi::String>().Utf8Value() : "";

  std::lock_guard<std::mutex> lock(engineMutex);
  if (!engine) {
    engine = std::make_unique<musicapp::AudioEngine>();
  }

  installEventCallback();
  engine->processCommand("engine_init", "{}");
  return Napi::String::New(
      env,
      engine->processCommand(
          "set_asset_root",
          assetRootJson(readRoot, writableRoot, sampleLibraryRoot)));
}

Napi::Value SendCommand(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const std::string command = info[0].As<Napi::String>().Utf8Value();
  const std::string payload = info[1].As<Napi::String>().Utf8Value();

  std::unique_lock<std::mutex> lock(engineMutex, std::try_to_lock);
  if (!lock.owns_lock()) {
    return Napi::String::New(
        env,
        "{\"ok\":false,\"code\":\"native_engine_busy\",\"error\":\"Native engine is busy with an async media task.\"}");
  }

  if (!engine) {
    engine = std::make_unique<musicapp::AudioEngine>();
    installEventCallback();
  }

  return Napi::String::New(env, engine->processCommand(command, payload));
}

class SendCommandAsyncWorker final : public Napi::AsyncWorker {
 public:
  SendCommandAsyncWorker(
      Napi::Env env,
      std::string command,
      std::string payload)
      : Napi::AsyncWorker(env),
        deferred_(Napi::Promise::Deferred::New(env)),
        command_(std::move(command)),
        payload_(std::move(payload)) {}

  Napi::Promise Promise() const {
    return deferred_.Promise();
  }

  void Execute() override {
    try {
      std::lock_guard<std::mutex> lock(engineMutex);
      if (!engine) {
        engine = std::make_unique<musicapp::AudioEngine>();
        installEventCallback();
      }
      response_ = engine->processCommand(command_, payload_);
    } catch (const std::exception& error) {
      SetError(error.what());
    } catch (...) {
      SetError("Unknown native bridge error");
    }
  }

  void OnOK() override {
    deferred_.Resolve(Napi::String::New(Env(), response_));
  }

  void OnError(const Napi::Error& error) override {
    deferred_.Reject(error.Value());
  }

 private:
  Napi::Promise::Deferred deferred_;
  std::string command_;
  std::string payload_;
  std::string response_;
};

Napi::Value SendCommandAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  const std::string command = info[0].As<Napi::String>().Utf8Value();
  const std::string payload = info[1].As<Napi::String>().Utf8Value();

  auto* worker = new SendCommandAsyncWorker(env, command, payload);
  auto promise = worker->Promise();
  worker->Queue();
  return promise;
}

Napi::Value ShutdownEngine(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::lock_guard<std::mutex> lock(engineMutex);
  if (engine) {
    engine->processCommand("engine_shutdown", "{}");
    engine.reset();
  }
  if (eventCallback) {
    eventCallback->Release();
    eventCallback.reset();
  }
  return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("initEngine", Napi::Function::New(env, InitEngine));
  exports.Set("sendCommand", Napi::Function::New(env, SendCommand));
  exports.Set("sendCommandAsync", Napi::Function::New(env, SendCommandAsync));
  exports.Set("setEventCallback", Napi::Function::New(env, SetEventCallback));
  exports.Set("shutdownEngine", Napi::Function::New(env, ShutdownEngine));
  return exports;
}

}  // namespace

NODE_API_MODULE(native_audio_engine, Init)
