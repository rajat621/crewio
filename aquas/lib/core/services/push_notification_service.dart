import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../navigation/root_navigator.dart';
import '../notifications/lifecycle_refresh_bus.dart';
import '../notifications/notification_router.dart';
import 'attendance_service.dart';
import 'notification_service.dart';

/// Wires this device up to receive push notifications for lifecycle events
/// (assignment, salary slip generated, new chat message, etc. - see
/// backend/src/services/push.service.js and every reportLifecycleEvent /
/// sendPushToEmployee call site).
///
/// REQUIRES a Firebase project already configured for this app (i.e.
/// android/app/google-services.json and ios/Runner/GoogleService-Info.plist
/// in place) - those platform config files are project secrets and aren't
/// part of this integration; add them from your Firebase console before
/// this service will actually receive pushes. Every call here is wrapped so
/// a missing/misconfigured Firebase project degrades to "no push
/// notifications" instead of crashing the app.
class PushNotificationService {
  final AttendanceService attendanceService;
  final NotificationService notificationService;
  bool _initialized = false;

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static const _androidChannel = AndroidNotificationChannel(
    'crewcontrol_default',
    'CrewControl Notifications',
    description: 'Assignment updates, salary slips, chat messages, and attendance alerts.',
    importance: Importance.high,
  );

  PushNotificationService({
    required this.attendanceService,
    required this.notificationService,
  });

  Future<void> initialize() async {
    if (_initialized) return;
    try {
      await Firebase.initializeApp();

      await _initLocalNotifications();

      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);

      final token = await messaging.getToken();
      if (token != null) {
        await attendanceService.registerPushToken(token);
      }

      // Keep the backend's copy of the token fresh if it rotates.
      messaging.onTokenRefresh.listen((newToken) {
        attendanceService.registerPushToken(newToken);
      });

      // Pick up however many notifications arrived while the app wasn't
      // running, and reflect them in the Bell icon badge right away.
      unawaited(notificationService.refreshUnreadCount());

      // FCM only auto-shows a system notification banner when the app is
      // backgrounded or terminated. In the FOREGROUND, messages arrive
      // silently unless we manually show one - without this, a push sent
      // while the app is open (e.g. the user is mid-session when the
      // office assigns them to a site) would never be seen at all.
      FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

      // Handle the user tapping a notification - both when it was tapped
      // to open the app fresh from the background, and one that launched
      // the app from a fully terminated state.
      FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);
      final initialMessage = await messaging.getInitialMessage();
      if (initialMessage != null) {
        _handleNotificationTap(initialMessage);
      }

      _initialized = true;
    } catch (e) {
      // Firebase not configured for this build, or permission denied -
      // push notifications simply won't arrive; nothing else in the app
      // depends on this succeeding.
    }
  }

  Future<void> _initLocalNotifications() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings(
      requestAlertPermission: false, // Notification permission is requested
      requestBadgePermission: false, // during onboarding (see
      requestSoundPermission: false, // notification_permission_page.dart).
    );
    await _localNotifications.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      onDidReceiveNotificationResponse: _handleLocalNotificationTap,
    );

    final androidImpl = _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await androidImpl?.createNotificationChannel(_androidChannel);
    // Belt-and-braces: the onboarding flow already requests this, but a
    // build that skips onboarding (or an existing install updating over
    // an older version) still needs it for local/foreground banners to
    // actually display on Android 13+.
    await androidImpl?.requestNotificationsPermission();
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    // Keep the notification center / badge in sync immediately, not just
    // on the next manual refresh.
    unawaited(notificationService.refreshUnreadCount());
    // If this is a site assignment/unassignment, ping Home to refetch its
    // lifecycle state right now - otherwise a user sitting on Home with
    // the app open would only see the change after manually reopening or
    // pulling to refresh, even though the push already arrived.
    LifecycleRefreshBus.notifyIfLifecycleEvent(message.data);

    final notification = message.notification;
    if (notification == null) return;

    await _localNotifications.show(
      message.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _androidChannel.id,
          _androidChannel.name,
          channelDescription: _androidChannel.description,
          importance: Importance.high,
          priority: Priority.high,
          // NOTE: this only controls notifications shown locally while the
          // app is in the FOREGROUND. Background/terminated-state pushes
          // are rendered directly by the OS from the FCM payload, so the
          // backend must ALSO avoid putting payroll figures, attendance
          // detail, or chat message bodies into the notification
          // title/body it sends - put only generic text there (e.g. "New
          // salary slip available", "You have a new message") and keep
          // specifics inside the `data` payload, which never reaches the
          // lock screen.
          visibility: NotificationVisibility.private,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      // Round-trips message.data through the local notification's payload
      // string so a tap on THIS locally-shown banner can deep-link exactly
      // like a tap on a real system-delivered FCM notification does.
      payload: _encodeDeepLinkPayload(message.data),
    );
  }

  void _handleNotificationTap(RemoteMessage message) {
    unawaited(notificationService.refreshUnreadCount());
    LifecycleRefreshBus.notifyIfLifecycleEvent(message.data);
    NotificationRouter.handle(rootNavigatorKey, message.data);
  }

  void _handleLocalNotificationTap(NotificationResponse response) {
    final data = _decodeDeepLinkPayload(response.payload);
    if (data == null) return;
    unawaited(notificationService.refreshUnreadCount());
    LifecycleRefreshBus.notifyIfLifecycleEvent(data);
    NotificationRouter.handle(rootNavigatorKey, data);
  }

  // flutter_local_notifications only carries a single String payload, so
  // FCM's data map is flattened to `key1=value1&key2=value2` (all values
  // here are simple strings/ids - see NotificationRouter.routeFor) and
  // parsed back out on tap.
  String _encodeDeepLinkPayload(Map<String, dynamic> data) {
    return data.entries.map((e) => '${e.key}=${e.value}').join('&');
  }

  Map<String, dynamic>? _decodeDeepLinkPayload(String? payload) {
    if (payload == null || payload.isEmpty) return null;
    final result = <String, dynamic>{};
    for (final part in payload.split('&')) {
      final idx = part.indexOf('=');
      if (idx <= 0) continue;
      result[part.substring(0, idx)] = part.substring(idx + 1);
    }
    return result;
  }
}