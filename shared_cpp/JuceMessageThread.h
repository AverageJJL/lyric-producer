#pragma once

#include <chrono>
#include <functional>
#include <future>
#include <memory>
#include <string>

namespace musicapp {

class JuceMessageThread {
 public:
  JuceMessageThread();
  ~JuceMessageThread();

  JuceMessageThread(const JuceMessageThread&) = delete;
  JuceMessageThread& operator=(const JuceMessageThread&) = delete;

  void start();
  void stop();

  template <typename Fn>
  auto runSync(Fn&& fn) -> decltype(fn()) {
    using Result = decltype(fn());
    auto task = std::make_shared<std::packaged_task<Result()>>(std::forward<Fn>(fn));
    auto future = task->get_future();
    post([task]() { (*task)(); });
    return future.get();
  }

  void post(std::function<void()> task);
  void postDelayed(std::chrono::milliseconds delay, std::function<void()> task);

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace musicapp
