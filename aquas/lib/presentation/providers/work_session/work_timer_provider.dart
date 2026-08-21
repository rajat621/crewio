// lib/presentation/providers/work_session/work_timer_provider.dart

import 'dart:async';

class WorkTimerProvider {
  static String workStatus = 'idle'; // idle, working, paused, on_leave
  static DateTime? workStartTime;
  static Duration elapsedTime = Duration.zero;
  static double dailyWorkHours = 0.0;
  
  static Timer? _timer;

  static void startTimer(DateTime startTime) {
    workStartTime = startTime;
    workStatus = 'working';
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (workStartTime != null) {
        elapsedTime = DateTime.now().difference(workStartTime!);
      }
    });
  }

  static void stopTimer() {
    _timer?.cancel();
    workStatus = 'idle';
    if (workStartTime != null) {
      elapsedTime = DateTime.now().difference(workStartTime!);
      dailyWorkHours += elapsedTime.inMinutes / 60.0;
    }
    workStartTime = null;
    elapsedTime = Duration.zero;
  }

  static void pauseTimer() {
    _timer?.cancel();
    workStatus = 'paused';
  }

  static void resumeTimer() {
    if (workStartTime != null) {
      startTimer(workStartTime!);
    }
  }

  static void reset() {
    _timer?.cancel();
    workStatus = 'idle';
    workStartTime = null;
    elapsedTime = Duration.zero;
    dailyWorkHours = 0.0;
  }

  static void dispose() {
    _timer?.cancel();
  }
}