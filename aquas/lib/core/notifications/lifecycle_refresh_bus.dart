// lib/core/notifications/lifecycle_refresh_bus.dart
//
// Home screen's assignment/work status (isWorking, isSiteFinished, etc.)
// is only as fresh as the last time it fetched from the backend. If the
// office assigns/unassigns/reactivates the employee while they're sitting
// on the Home screen with the app open, nothing was previously telling
// Home to re-fetch - the user had to background/reopen the app or
// pull-to-refresh to see it. This bus lets PushNotificationService ping
// Home directly the moment a relevant push arrives in the foreground.
import 'package:flutter/foundation.dart';

class LifecycleRefreshBus {
  LifecycleRefreshBus._();

  // Value itself is meaningless - only every CHANGE to it matters, so
  // listeners re-fetch. A plain counter avoids needing a whole streaming
  // setup for what's essentially a "hey, go refresh" ping.
  static final ValueNotifier<int> tick = ValueNotifier<int>(0);

  /// Notification `type`s (see NotificationRouter) that mean "the
  /// employee's site assignment or work lifecycle state may have just
  /// changed on the backend" - worth an immediate Home refresh rather
  /// than waiting for the user to notice and pull-to-refresh.
  static const _lifecycleAffectingTypes = {
    'site_assigned',
    'site_unassigned',
  };

  /// Call with a push/notification's `data` map (or `payload`) - pings
  /// listeners only if this notification actually affects the Home
  /// screen's lifecycle state.
  static void notifyIfLifecycleEvent(Map<String, dynamic> data) {
    if (_lifecycleAffectingTypes.contains(data['type']?.toString())) {
      tick.value = tick.value + 1;
    }
  }

  /// Unconditional ping - for callers that already know a refresh is
  /// warranted (e.g. AttendanceOfflineQueue, after a queued check-in/
  /// start-work/stop-work/site-finished action actually syncs).
  static void pingNow() {
    tick.value = tick.value + 1;
  }
}
