// lib/presentation/pages/splash/splash_page.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../config/theme/app_colors.dart';
import '../../providers/auth_provider.dart';
import 'package:flutter_svg/flutter_svg.dart';

Future<String> resolveNextRoute({
  required Future<bool> Function() checkAuthStatus,
  Duration timeout = const Duration(seconds: 3),
}) async {
  try {
    final isAuthenticated = await checkAuthStatus().timeout(timeout);
    return isAuthenticated ? '/home' : '/login';
  } on TimeoutException {
    if (kDebugMode) debugPrint('Auth check timed out; falling back to login');
    return '/login';
  } catch (e, stackTrace) {
    if (kDebugMode) debugPrint('Auth check failed: $e\n$stackTrace');
    return '/login';
  }
}

class SplashPage extends ConsumerStatefulWidget {
  const SplashPage({super.key});

  @override
  ConsumerState<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends ConsumerState<SplashPage>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;
  late Animation<double> _scaleAnimation;

  // Minimum time the branded splash stays up, so it never just flashes on
  // a fast device/warm cache - the auth check below runs concurrently with
  // this, not after it.
  static const _minSplashDuration = Duration(seconds: 2);

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeIn),
    );

    _scaleAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOutCubic),
    );

    _animationController.forward();

    _decideNextRoute();
  }

  // Restores the previous session instead of always bouncing to /login.
  // `checkAuthStatus()` looks for a locally-stored token (see
  // TokenService/AuthService) - it doesn't need to hit the network here,
  // because ApiClient's interceptor already transparently refreshes an
  // expired access token (using the refresh token) on the very first
  // authenticated request the Home screen makes. That's what satisfies
  // "verify access token in the background" without adding a blocking
  // round-trip to the splash screen itself.
  Future<void> _decideNextRoute() async {
    final minWait = Future.delayed(_minSplashDuration);
    final nextRoute = await resolveNextRoute(
      checkAuthStatus: () => ref.read(authProvider.notifier).authService.isAuthenticated(),
      timeout: const Duration(seconds: 3),
    );
    await minWait;

    if (!mounted) return;

    Navigator.of(context).pushReplacementNamed(nextRoute);
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Splash (and Login) use a dark blue status bar to match the brand
    // background; every other screen in the app keeps the white status
    // bar set globally in main.dart.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Color(0xFF1E40AF),
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark, // iOS
        systemNavigationBarColor: Color(0xFF1E40AF),
        systemNavigationBarIconBrightness: Brightness.light,
      ),
      child: Scaffold(
        backgroundColor: AppColors.primaryBlue,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Logo with animation
              FadeTransition(
                opacity: _fadeAnimation,
                child: ScaleTransition(
                  scale: _scaleAnimation,
                  child: SvgPicture.asset(
  'assets/images/logo.svg',
  width: 180,
  height: 180,
  fit: BoxFit.contain,
),
                ),
              ),
              const SizedBox(height: 60),
              // Loading indicator
              FadeTransition(
                opacity: _fadeAnimation,
                child: const SizedBox(
                  width: 50,
                  height: 50,
                  child: CircularProgressIndicator(
                    valueColor: AlwaysStoppedAnimation<Color>(
                      AppColors.warningYellow,
                    ),
                    strokeWidth: 3,
                  ),
                ),
              ),
              const SizedBox(height: 40),
              // Loading text
              FadeTransition(
                opacity: _fadeAnimation,
                child: const Text(
                  'Initializing App...',
                  style: TextStyle(
                    color: AppColors.bgWhite,
                    fontSize: 16,
                    fontFamily: 'Poppins',
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}