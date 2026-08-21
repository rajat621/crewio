// lib/core/services/attendance_offline_queue.dart
import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../notifications/lifecycle_refresh_bus.dart';
import '../errors/error_message_mapper.dart';
import 'attendance_service.dart';

/// One queued attendance action, in the exact form needed to replay it
/// later. `queuedAt` is the real moment the button was tapped - this is
/// what gets sent to the backend as `timestamp` on replay, not whenever
/// the replay actually runs.
class _QueuedAction {
  final String type; // checkIn | startWork | stopWork | siteFinished
  final DateTime queuedAt;
  final double? lat;
  final double? lng;
  final double? accuracy;
  final double? hoursWorked; // stopWork only

  _QueuedAction({
    required this.type,
    required this.queuedAt,
    this.lat,
    this.lng,
    this.accuracy,
    this.hoursWorked,
  });

  Map<String, dynamic> toJson() => {
        'type': type,
        'queuedAt': queuedAt.toIso8601String(),
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        if (accuracy != null) 'accuracy': accuracy,
        if (hoursWorked != null) 'hoursWorked': hoursWorked,
      };

  factory _QueuedAction.fromJson(Map<String, dynamic> json) => _QueuedAction(
        type: json['type'] as String,
        queuedAt: DateTime.parse(json['queuedAt'] as String),
        lat: (json['lat'] as num?)?.toDouble(),
        lng: (json['lng'] as num?)?.toDouble(),
        accuracy: (json['accuracy'] as num?)?.toDouble(),
        hoursWorked: (json['hoursWorked'] as num?)?.toDouble(),
      );
}

/// Whether the on-screen state was ever queued rather than confirmed by
/// the server - Home shows a small "will sync" indicator based on this.
class AttendanceSyncStatus {
  AttendanceSyncStatus._();
  static final ValueNotifier<int> pendingCount = ValueNotifier<int>(0);
  // Set when a replay fails for a reason OTHER than connectivity - this
  // needs a human to look at it, not just "wait and retry".
  static final ValueNotifier<String?> lastSyncError = ValueNotifier<String?>(null);
}

class AttendanceOfflineQueue {
  final AttendanceService attendanceService;
  static const _key = 'attendance_pending_actions_v1';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  bool _isFlushing = false;

  AttendanceOfflineQueue({required this.attendanceService});

  Future<void> enqueueCheckIn({double? lat, double? lng, double? accuracy}) =>
      _enqueue(_QueuedAction(type: 'checkIn', queuedAt: DateTime.now(), lat: lat, lng: lng, accuracy: accuracy));

  Future<void> enqueueStartWork({double? lat, double? lng, double? accuracy}) =>
      _enqueue(_QueuedAction(type: 'startWork', queuedAt: DateTime.now(), lat: lat, lng: lng, accuracy: accuracy));

  Future<void> enqueueStopWork({double? lat, double? lng, double? accuracy, double? hoursWorked}) => _enqueue(
      _QueuedAction(type: 'stopWork', queuedAt: DateTime.now(), lat: lat, lng: lng, accuracy: accuracy, hoursWorked: hoursWorked));

  Future<void> enqueueSiteFinished({double? lat, double? lng, double? accuracy}) =>
      _enqueue(_QueuedAction(type: 'siteFinished', queuedAt: DateTime.now(), lat: lat, lng: lng, accuracy: accuracy));

  Future<void> _enqueue(_QueuedAction action) async {
    final queue = await _readQueue();
    queue.add(action);
    await _writeQueue(queue);
  }

  /// Replays every queued action, in order, against the real backend.
  /// Stops at the first failure of ANY kind (not just connectivity) and
  /// keeps everything from that point on queued - unlike the notification
  /// queue, we never silently drop an attendance action, since each one
  /// represents real pay data. A non-connectivity failure also surfaces via
  /// [AttendanceSyncStatus.lastSyncError] so the UI can tell the person to
  /// get help rather than assuming it'll quietly resolve itself.
  Future<void> flush() async {
    if (_isFlushing) return;
    _isFlushing = true;
    try {
      final queue = await _readQueue();
      if (queue.isEmpty) {
        AttendanceSyncStatus.pendingCount.value = 0;
        return;
      }

      var processed = 0;
      for (final action in queue) {
        try {
          await _replay(action);
          processed++;
        } catch (e) {
          final isConnectivity = _looksLikeConnectivityError(e);
          if (!isConnectivity) {
            // A real error (e.g. state conflict) - stop here, surface it,
            // and leave this + everything after it queued for the person
            // (or you, from the logs) to sort out rather than losing it.
            AttendanceSyncStatus.lastSyncError.value =
                'Could not sync your ${action.type} update. ${ErrorMessageMapper.toUserMessage(e)}';
          }
          break;
        }
      }

      final remaining = queue.sublist(processed);
      await _writeQueue(remaining);
      AttendanceSyncStatus.pendingCount.value = remaining.length;

      if (processed > 0) {
        // At least one queued action actually reached the backend - Home's
        // displayed state (hours worked, working/checked-in status) was
        // set optimistically when it was queued and needs to be
        // reconciled with what the server now has (e.g. the real
        // server-computed hoursWorked for a stop-work action, not just
        // the value the person picked in the dialog).
        LifecycleRefreshBus.pingNow();
      }
    } finally {
      _isFlushing = false;
    }
  }

  Future<void> _replay(_QueuedAction action) async {
    switch (action.type) {
      case 'checkIn':
        await attendanceService.checkIn(
          lat: action.lat, lng: action.lng, accuracy: action.accuracy, timestamp: action.queuedAt);
        break;
      case 'startWork':
        await attendanceService.startWork(
          lat: action.lat, lng: action.lng, accuracy: action.accuracy, timestamp: action.queuedAt);
        break;
      case 'stopWork':
        await attendanceService.stopWork(
          lat: action.lat,
          lng: action.lng,
          accuracy: action.accuracy,
          hoursWorked: action.hoursWorked,
          timestamp: action.queuedAt,
        );
        break;
      case 'siteFinished':
        await attendanceService.siteFinished(
          lat: action.lat, lng: action.lng, accuracy: action.accuracy, timestamp: action.queuedAt);
        break;
    }
  }

  bool _looksLikeConnectivityError(Object e) => isConnectivityError(e);

  /// AttendanceService throws a plain String message (see _message()), not
  /// the raw DioException, so this matches on the message text Dio
  /// produces for connection failures rather than the exception type.
  /// Public so Home's action handlers can use the exact same check when
  /// deciding whether to queue an action vs. show a real error.
  static bool isConnectivityError(Object e) {
    final msg = e.toString().toLowerCase();
    return msg.contains('connection') ||
        msg.contains('network') ||
        msg.contains('socket') ||
        msg.contains('timeout') ||
        msg.contains('unreachable');
  }

  Future<int> pendingCount() async => (await _readQueue()).length;

  Future<List<_QueuedAction>> _readQueue() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return [];
      final List decoded = jsonDecode(raw) as List;
      return decoded.map((e) => _QueuedAction.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _writeQueue(List<_QueuedAction> queue) async {
    try {
      if (queue.isEmpty) {
        await _storage.delete(key: _key);
      } else {
        await _storage.write(key: _key, value: jsonEncode(queue.map((a) => a.toJson()).toList()));
      }
    } catch (_) {
      // Best-effort - worst case it's retried from wherever it was left on next launch.
    }
  }
}