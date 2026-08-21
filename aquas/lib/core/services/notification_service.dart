import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../network/api_client.dart';
import '../../data/models/mobile_models.dart';
import '../notifications/notification_badge.dart';

class NotificationService {
  final ApiClient apiClient;
  static const _offlineCacheKey = 'notifications_offline_cache_v1';
  static const _pendingActionsKey = 'notifications_pending_actions_v1';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  // Prevents two flushes (e.g. connectivity-restored callback AND a
  // manual pull-to-refresh) from racing each other and double-sending
  // the same queued action.
  bool _isFlushing = false;

  NotificationService({required this.apiClient});

  /// Fetches one page of notifications, newest first. `page` is 1-based.
  /// Falls back to the last successfully-fetched page 1 when offline (or
  /// on any request failure) so previously-seen notifications remain
  /// visible rather than the screen just erroring out.
  Future<NotificationPageResult> getNotifications({
    int page = 1,
    int limit = 20,
  }) async {
    // Opportunistically catch up on anything queued while offline every
    // time the list is loaded (covers "app reopened with a connection
    // now available" in addition to the live connectivity listener).
    unawaited(flushPendingActions());

    try {
      final response = await apiClient.get(
        '/api/notifications',
        queryParameters: {'page': page, 'limit': limit},
      );
      final List data = response.data['data'] as List? ?? [];
      var items = data
          .map((e) => NotificationModel.fromJson(e as Map<String, dynamic>))
          .toList();
      final hasMore = response.data['hasMore'] as bool? ?? false;

      if (page == 1) {
        // Reflect any not-yet-synced local read actions in what we just
        // fetched, so a notification marked read offline doesn't flash
        // back to "unread" until the queue is flushed.
        items = await _applyPendingLocally(items);
        unawaited(_cacheFirstPage(items));
      }

      return NotificationPageResult(items: items, page: page, hasMore: hasMore);
    } on DioException catch (e) {
      if (page == 1) {
        final cached = await _readCachedFirstPage();
        if (cached != null) {
          return NotificationPageResult(
            items: await _applyPendingLocally(cached),
            page: 1,
            hasMore: false,
          );
        }
      }
      throw _message(e);
    }
  }

  Future<void> markRead(String id) async {
    try {
      await apiClient.post('/api/notifications/$id/read');
      NotificationBadge.decrement();
    } on DioException catch (e) {
      if (_isConnectivityError(e)) {
        // No connection right now - apply it locally and queue it for
        // real sync the moment connectivity returns (see
        // flushPendingActions(), triggered by ConnectivityWatcher and by
        // every subsequent getNotifications() call).
        await _enqueue({'type': 'markRead', 'id': id});
        NotificationBadge.decrement();
        return;
      }
      throw _message(e);
    }
  }

  Future<void> markAllRead() async {
    try {
      await apiClient.post('/api/notifications/read-all');
      NotificationBadge.clear();
    } on DioException catch (e) {
      if (_isConnectivityError(e)) {
        // A queued "mark all read" makes every individually-queued
        // markRead redundant, and any markRead queued AFTER this point
        // (while still offline) is also already covered by it.
        await _replaceQueueWith({'type': 'markAllRead'});
        NotificationBadge.clear();
        return;
      }
      throw _message(e);
    }
  }

  /// Refreshes the Bell icon badge from the backend. Safe to call
  /// liberally (login, pull-to-refresh, app resume, push received) -
  /// failures are swallowed since a stale badge count is never worth
  /// surfacing an error for.
  Future<void> refreshUnreadCount() async {
    try {
      final response = await apiClient.get('/api/notifications/count');
      final count = response.data['unreadCount'] as int? ?? 0;
      NotificationBadge.set(count);
    } catch (_) {
      // Non-critical - leave the badge showing whatever it last had.
    }
  }

  /// Replays every notification action that was performed while offline,
  /// in the order they happened, against the real backend. Called:
  ///  - whenever connectivity comes back (ConnectivityWatcher)
  ///  - on every getNotifications() call (covers "app reopened online")
  ///  - after login / on Home load
  /// Stops (and keeps the remainder queued) at the first failure that
  /// looks like "still offline" rather than dropping the whole queue.
  Future<void> flushPendingActions() async {
    if (_isFlushing) return;
    _isFlushing = true;
    try {
      var queue = await _readQueue();
      if (queue.isEmpty) return;

      final remaining = <Map<String, dynamic>>[];
      for (var i = 0; i < queue.length; i++) {
        final action = queue[i];
        try {
          if (action['type'] == 'markAllRead') {
            await apiClient.post('/api/notifications/read-all');
          } else if (action['type'] == 'markRead') {
            await apiClient.post('/api/notifications/${action['id']}/read');
          }
        } on DioException catch (e) {
          if (_isConnectivityError(e)) {
            // Still offline - keep this and everything after it queued,
            // in order, and stop trying for now.
            remaining.addAll(queue.sublist(i));
            break;
          }
          // A real error (e.g. the notification no longer exists) - drop
          // just this one action rather than blocking the rest forever.
        }
      }

      await _writeQueue(remaining);

      if (remaining.length != queue.length) {
        // Something actually synced - resync the true count from the server.
        unawaited(refreshUnreadCount());
      }
    } finally {
      _isFlushing = false;
    }
  }

  bool _isConnectivityError(DioException e) {
    return e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout ||
        e.type == DioExceptionType.sendTimeout ||
        e.type == DioExceptionType.unknown;
  }

  Future<List<NotificationModel>> _applyPendingLocally(
    List<NotificationModel> items,
  ) async {
    final queue = await _readQueue();
    if (queue.isEmpty) return items;

    final markAllPending = queue.any((a) => a['type'] == 'markAllRead');
    final pendingIds = queue
        .where((a) => a['type'] == 'markRead')
        .map((a) => a['id'] as String)
        .toSet();

    if (!markAllPending && pendingIds.isEmpty) return items;

    return items
        .map((n) => (markAllPending || pendingIds.contains(n.id))
            ? n.copyWith(read: true)
            : n)
        .toList();
  }

  Future<void> _enqueue(Map<String, dynamic> action) async {
    final queue = await _readQueue();
    // Avoid piling up duplicate markRead entries for the same id.
    queue.removeWhere((a) => a['type'] == 'markRead' && a['id'] == action['id']);
    queue.add(action);
    await _writeQueue(queue);
  }

  Future<void> _replaceQueueWith(Map<String, dynamic> action) async {
    await _writeQueue([action]);
  }

  Future<List<Map<String, dynamic>>> _readQueue() async {
    try {
      final raw = await _storage.read(key: _pendingActionsKey);
      if (raw == null) return [];
      final List decoded = jsonDecode(raw) as List;
      return decoded.cast<Map<String, dynamic>>();
    } catch (_) {
      return [];
    }
  }

  Future<void> _writeQueue(List<Map<String, dynamic>> queue) async {
    try {
      if (queue.isEmpty) {
        await _storage.delete(key: _pendingActionsKey);
      } else {
        await _storage.write(key: _pendingActionsKey, value: jsonEncode(queue));
      }
    } catch (_) {
      // Best-effort - worst case the queued action is retried on next launch anyway.
    }
  }

  Future<void> _cacheFirstPage(List<NotificationModel> items) async {
    try {
      final encoded = jsonEncode(items
          .map((n) => {
                '_id': n.id,
                'title': n.title,
                'body': n.body,
                'read': n.read,
                'createdAt': n.createdAt.toIso8601String(),
                'payload': n.payload,
              })
          .toList());
      await _storage.write(key: _offlineCacheKey, value: encoded);
    } catch (_) {
      // Caching is best-effort - never let it break a successful fetch.
    }
  }

  Future<List<NotificationModel>?> _readCachedFirstPage() async {
    try {
      final raw = await _storage.read(key: _offlineCacheKey);
      if (raw == null) return null;
      final List decoded = jsonDecode(raw) as List;
      return decoded
          .map((e) => NotificationModel.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return null;
    }
  }

  String _message(DioException error) {
    final data = error.response?.data;
    return (data is Map ? data['message'] : null)?.toString() ??
        error.message ??
        'Something went wrong. Please try again.';
  }
}
