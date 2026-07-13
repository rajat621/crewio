import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'attendance_service.dart';

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
  bool _initialized = false;

  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static const _androidChannel = AndroidNotificationChannel(
    'crewcontrol_default',
    'CrewControl Notifications',
    description: 'Assignment updates, salary slips, chat messages, and attendance alerts.',
    importance: Importance.high,
  );

  PushNotificationService({required this.attendanceService});

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

      // FCM only auto-shows a system notification banner when the app is
      // backgrounded or terminated. In the FOREGROUND, messages arrive
      // silently unless we manually show one - without this, a push sent
      // while the app is open (e.g. the user is mid-session when the
      // office assigns them to a site) would never be seen at all.
      FirebaseMessaging.onMessage.listen(_showForegroundNotification);

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
      requestAlertPermission: false, // FCM's own requestPermission() above covers this
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _localNotifications.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
    );

    final androidImpl = _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await androidImpl?.createNotificationChannel(_androidChannel);
    // Android 13+ requires this runtime permission for any notification
    // (local or FCM-triggered) to actually display.
    await androidImpl?.requestNotificationsPermission();
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
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
        ),
        iOS: const DarwinNotificationDetails(),
      ),
    );
  }

  void _handleNotificationTap(RemoteMessage message) {
    // Where a tap navigates to depends on `data.type` set by the backend
    // (salary_slip, chat_message, employee:assigned, etc.) - left as a hook
    // for whoever wires up the app's navigator/router, since this service
    // doesn't have a BuildContext of its own. For now this simply makes
    // sure a tap doesn't get silently dropped.
  }
}