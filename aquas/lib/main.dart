// lib/main.dart

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'config/theme/app_theme.dart';
import 'presentation/pages/splash/splash_page.dart';
import 'presentation/pages/auth/login_page.dart';
import 'presentation/pages/location/location_permission_page.dart';
import 'presentation/pages/notification/notification_permission_page.dart';
import 'presentation/pages/payment/salary_slips_page.dart';
import 'presentation/pages/notification/notification_page.dart';
import 'presentation/pages/profile/profile_page.dart';
import 'presentation/pages/navigation/app_shell_page.dart';
import 'presentation/widgets/common/bottom_nav_bar.dart';
import 'core/navigation/root_navigator.dart';
import 'core/navigation/current_route_tracker.dart';
import 'presentation/pages/payment/view_advance_page.dart';
import 'service_locator.dart';

// Must be a TOP-LEVEL (or static) function - this is what Firebase actually
// requires to run push handling in its own background isolate while the app
// is backgrounded or fully terminated. Kept intentionally minimal: its only
// job is to make sure Firebase is initialized in that isolate so the OS can
// hand the terminated/background case off to FCM's own system-tray display;
// the durable copy of every notification already lives on the backend
// (see Notification.create() calls paired with every sendPushToEmployee())
// and is fetched normally the next time the app is opened, so there's
// nothing else that needs to happen in this isolate.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

// Default system bar style for every screen in the app. Splash and Login
// override this locally with their own nested AnnotatedRegion (blue); once
// those screens are popped/replaced, this outer region is the only one
// left in the tree, so the status bar reliably falls back to white instead
// of getting stuck on whatever the last screen set.
const SystemUiOverlayStyle _defaultOverlayStyle = SystemUiOverlayStyle(
  statusBarColor: Colors.white,
  statusBarIconBrightness: Brightness.dark,
  statusBarBrightness: Brightness.light, // iOS
  systemNavigationBarColor: Colors.white,
  systemNavigationBarIconBrightness: Brightness.dark,
  systemNavigationBarDividerColor: Colors.transparent,
);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(_defaultOverlayStyle);

  // Must be registered before runApp, and before any other Firebase call,
  // so background/terminated pushes are routed to it from the moment the
  // app process exists.
  //
  // Wrapped defensively: if this device's Firebase config is missing or
  // mismatched (no/incorrect google-services.json, wrong package name,
  // etc.), Firebase.initializeApp() can hang instead of throwing - which
  // would block the very first frame from ever drawing (the app just
  // sits on the OS's own "app is taking a while" screen forever). Push
  // notifications simply won't work in that case, same as if
  // PushNotificationService.initialize() later fails - everything else
  // in the app is unaffected.
  try {
    await Firebase.initializeApp().timeout(const Duration(seconds: 5));
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  } catch (e) {
    if (kDebugMode) debugPrint('Firebase initialization skipped/failed: $e');
  }

  // Initialize services
  final serviceLocator = ServiceLocator();
  await serviceLocator.setup();

  runApp(
    ProviderScope(
      overrides: serviceLocator.providerOverrides(),
      child: const AQASLaborApp(),
    ),
  );
}

class AQASLaborApp extends StatelessWidget {
  const AQASLaborApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: rootNavigatorKey,
      navigatorObservers: [CurrentRouteTracker()],
      title: 'Crewio',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.light,
      debugShowCheckedModeBanner: false,
      home: const SplashPage(),
      builder: (context, child) {
        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: _defaultOverlayStyle,
          child: DefaultTextHeightBehavior(
            textHeightBehavior: const TextHeightBehavior(
              applyHeightToFirstAscent: false,
              applyHeightToLastDescent: false,
              leadingDistribution: TextLeadingDistribution.even,
            ),
            child: DefaultTextStyle.merge(
              style: const TextStyle(height: 1.0),
              child: child ?? const SizedBox.shrink(),
            ),
          ),
        );
      },
      routes: {
        '/splash': (context) => const SplashPage(),
        '/login': (context) => const LoginPage(),
        '/permission': (context) => const LocationPermissionPage(),
        '/notification-permission': (context) => const NotificationPermissionPage(),
        '/home': (context) => const AppShellPage(initialTab: AppTab.home),
        '/payment': (context) => const AppShellPage(initialTab: AppTab.payment),
        '/salary-slips': (context) => const SalarySlipsPage(),
        '/calendar': (context) =>
            const AppShellPage(initialTab: AppTab.calendar),
        '/chat': (context) => const AppShellPage(initialTab: AppTab.chat),
        '/notifications': (context) => const NotificationPage(),
        '/profile': (context) => const ProfilePage(),
        '/view-advance': (context) => const ViewAdvancePage(),
      },
      onGenerateRoute: (settings) {
        // Handle unknown routes
        return MaterialPageRoute(
          builder: (context) => Scaffold(
            appBar: AppBar(title: const Text('Not Found')),
            body: Center(child: Text('Route ${settings.name} not found')),
          ),
        );
      },
    );
  }
}