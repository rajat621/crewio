// lib/core/notifications/notification_badge.dart
//
// App-wide unread notification count, kept in sync by:
//  - NotificationService whenever it fetches the list, marks one read, or
//    marks all read.
//  - PushNotificationService whenever a push arrives in the foreground or
//    is tapped.
// The Bell icon on Home listens to this via a ValueListenableBuilder.
import 'package:flutter/foundation.dart';

class NotificationBadge {
  NotificationBadge._();

  static final ValueNotifier<int> unreadCount = ValueNotifier<int>(0);

  static void set(int value) {
    unreadCount.value = value < 0 ? 0 : value;
  }

  static void increment() {
    unreadCount.value = unreadCount.value + 1;
  }

  static void decrement() {
    unreadCount.value = unreadCount.value > 0 ? unreadCount.value - 1 : 0;
  }

  static void clear() {
    unreadCount.value = 0;
  }
}
