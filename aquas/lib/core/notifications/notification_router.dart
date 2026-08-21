// lib/core/notifications/notification_router.dart
//
// Maps a notification's `type` (see backend: reportLifecycleEvent's
// `data.type`, salarySlip.controller.js / chat.controller.js's
// `notifPayload.type`) to an actual in-app screen. Used both when a push
// notification is tapped (foreground/background/cold-start) and when a
// notification is tapped inside the in-app Notification Center, so both
// paths always agree on where a given notification type goes.
import 'package:flutter/material.dart';
import '../navigation/current_route_tracker.dart';

class NotificationRouter {
  const NotificationRouter._();

  /// Navigates using the app's root navigator - safe to call from a
  /// context-free service (e.g. FCM background/foreground callbacks).
  static void handle(
    GlobalKey<NavigatorState> navigatorKey,
    Map<String, dynamic> data,
  ) {
    final route = routeFor(data);
    final navigator = navigatorKey.currentState;
    if (navigator == null || route == null) return;

    // Don't stack a duplicate copy of whatever screen is already showing
    // (e.g. tapping a legacy/untyped notification, whose fallback
    // destination is '/notifications', while already viewing the
    // Notification Center).
    if (CurrentRouteTracker.currentRouteName == route) return;

    navigator.pushNamed(route);
  }

  /// Pure mapping (no navigation side effect) so it's also usable from a
  /// widget's own onTap via Navigator.of(context).pushNamed(...).
  static String? routeFor(Map<String, dynamic> data) {
    final type = data['type']?.toString();
    switch (type) {
      case 'salary_slip':
        return '/salary-slips';
      case 'chat_message':
        return '/chat';
      case 'site_assigned':
      case 'site_unassigned':
        // Home shows current assignment status - there isn't a separate
        // "Site Details" / "My Sites" screen in this app yet.
        return '/home';
      default:
        // Unknown/new notification type - future-ready fallback: open the
        // notification center itself rather than doing nothing.
        return '/notifications';
    }
  }
}
