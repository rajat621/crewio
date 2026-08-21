// lib/core/services/connectivity_watcher.dart
import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'attendance_offline_queue.dart';
import 'notification_service.dart';

class ConnectivityWatcher {
  final NotificationService notificationService;
  final AttendanceOfflineQueue attendanceOfflineQueue;
  StreamSubscription<List<ConnectivityResult>>? _subscription;
  bool _wasOffline = false;

  ConnectivityWatcher({
    required this.notificationService,
    required this.attendanceOfflineQueue,
  });

  void start() {
    _subscription = Connectivity().onConnectivityChanged.listen((results) {
      final isOffline = results.every((r) => r == ConnectivityResult.none);
      if (_wasOffline && !isOffline) {
        // Connection just came back - replay whatever was queued while
        // offline (see NotificationService.flushPendingActions() and
        // AttendanceOfflineQueue.flush()).
        unawaited(notificationService.flushPendingActions());
        unawaited(attendanceOfflineQueue.flush());
      }
      _wasOffline = isOffline;
    });
  }

  void dispose() {
    _subscription?.cancel();
  }
}
