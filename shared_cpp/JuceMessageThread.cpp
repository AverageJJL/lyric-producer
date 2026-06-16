#include "JuceMessageThread.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <thread>
#include <vector>

namespace musicapp {

class JuceMessageThread::Impl {
 public:
  void start() {
    if (running_.exchange(true)) {
      return;
    }

    thread_ = std::thread([this] { runLoop(); });
    delayedThread_ = std::thread([this] { runDelayedLoop(); });
    waitUntilReady();
  }

  void stop() {
    if (!running_.exchange(false)) {
      return;
    }

    queueCv_.notify_all();
    delayedCv_.notify_all();

    if (delayedThread_.joinable()) {
      delayedThread_.join();
    }

    if (thread_.joinable()) {
      thread_.join();
    }

    {
      std::lock_guard<std::mutex> lock(delayedMutex_);
      delayedTasks_.clear();
    }
    ready_ = false;
  }

  void post(std::function<void()> task) {
    if (!task) {
      return;
    }

    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (!running_) {
        return;
      }
      queue_.push_back(std::move(task));
    }

    queueCv_.notify_one();
  }

  void postDelayed(std::chrono::milliseconds delay, std::function<void()> task) {
    if (!task) {
      return;
    }

    if (delay <= std::chrono::milliseconds::zero()) {
      post(std::move(task));
      return;
    }

    {
      std::lock_guard<std::mutex> lock(delayedMutex_);
      if (!running_) {
        return;
      }
      delayedTasks_.push_back({
          std::chrono::steady_clock::now() + delay,
          nextDelayedSequence_++,
          std::move(task),
      });
    }

    delayedCv_.notify_one();
  }

 private:
  struct DelayedTask {
    std::chrono::steady_clock::time_point dueAt;
    std::size_t sequence = 0;
    std::function<void()> task;
  };

  void runLoop() {
    // Electron owns the process message loop on desktop. This worker serializes
    // engine mutations without asking JUCE to run AppKit/Win32 event dispatch.
    ready_ = true;
    readyCv_.notify_all();

    while (running_ || !queue_.empty()) {
      std::function<void()> task;
      {
        std::unique_lock<std::mutex> lock(mutex_);
        queueCv_.wait(lock, [this] { return !running_ || !queue_.empty(); });
        if (!queue_.empty()) {
          task = std::move(queue_.front());
          queue_.pop_front();
        }
      }
      if (task) {
        task();
      }
    }
  }

  void runDelayedLoop() {
    while (running_) {
      std::function<void()> task;
      {
        std::unique_lock<std::mutex> lock(delayedMutex_);
        delayedCv_.wait(lock, [this] { return !running_ || !delayedTasks_.empty(); });
        if (!running_) {
          break;
        }

        const auto nextDue = nextDelayedTaskLocked()->dueAt;
        if (delayedCv_.wait_until(lock, nextDue, [this, nextDue] {
              return !running_ || hasDelayedTaskBeforeLocked(nextDue);
            })) {
          continue;
        }

        if (!running_) {
          break;
        }

        auto nextTask = nextDelayedTaskLocked();
        if (nextTask == delayedTasks_.end()
            || nextTask->dueAt > std::chrono::steady_clock::now()) {
          continue;
        }

        task = std::move(nextTask->task);
        delayedTasks_.erase(nextTask);
      }

      post(std::move(task));
    }
  }

  void waitUntilReady() {
    std::unique_lock<std::mutex> lock(mutex_);
    readyCv_.wait(lock, [this] { return ready_.load(); });
  }

  std::vector<DelayedTask>::iterator nextDelayedTaskLocked() {
    return std::min_element(
        delayedTasks_.begin(),
        delayedTasks_.end(),
        [](const DelayedTask& lhs, const DelayedTask& rhs) {
          if (lhs.dueAt == rhs.dueAt) {
            return lhs.sequence < rhs.sequence;
          }
          return lhs.dueAt < rhs.dueAt;
        });
  }

  bool hasDelayedTaskBeforeLocked(const std::chrono::steady_clock::time_point dueAt) {
    return std::any_of(
        delayedTasks_.begin(),
        delayedTasks_.end(),
        [dueAt](const DelayedTask& task) { return task.dueAt < dueAt; });
  }

  std::thread thread_;
  std::thread delayedThread_;
  std::atomic<bool> running_{false};
  std::atomic<bool> ready_{false};
  std::mutex mutex_;
  std::condition_variable readyCv_;
  std::condition_variable queueCv_;
  std::deque<std::function<void()>> queue_;
  std::mutex delayedMutex_;
  std::condition_variable delayedCv_;
  std::vector<DelayedTask> delayedTasks_;
  std::size_t nextDelayedSequence_ = 0;
};

JuceMessageThread::JuceMessageThread() : impl_(std::make_unique<Impl>()) {}
JuceMessageThread::~JuceMessageThread() { stop(); }

void JuceMessageThread::start() { impl_->start(); }
void JuceMessageThread::stop() { impl_->stop(); }

void JuceMessageThread::post(std::function<void()> task) { impl_->post(std::move(task)); }
void JuceMessageThread::postDelayed(std::chrono::milliseconds delay, std::function<void()> task) {
  impl_->postDelayed(delay, std::move(task));
}

}  // namespace musicapp
