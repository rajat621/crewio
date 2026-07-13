// lib/main.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'config/theme/app_theme.dart';
import 'presentation/pages/splash/splash_page.dart';
import 'presentation/pages/auth/login_page.dart';
import 'presentation/pages/location/location_permission_page.dart';
import 'presentation/pages/payment/salary_slips_page.dart';
import 'presentation/pages/notification/notification_page.dart';
import 'presentation/pages/profile/profile_page.dart';
import 'presentation/pages/navigation/app_shell_page.dart';
import 'presentation/widgets/common/bottom_nav_bar.dart';
import 'presentation/pages/payment/view_advance_page.dart';
import 'service_locator.dart';

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
      title: 'AQAS Labor Management',
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