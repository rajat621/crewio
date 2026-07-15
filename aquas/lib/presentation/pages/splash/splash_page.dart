
// lib/presentation/pages/splash/splash_page.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../config/theme/app_colors.dart';
import 'package:flutter_svg/flutter_svg.dart';

class SplashPage extends StatefulWidget {
  const SplashPage({super.key});

  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _fadeAnimation;
  late Animation<double> _scaleAnimation;
  Timer? _navigationTimer;

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

    _navigationTimer = Timer(const Duration(seconds: 3), () {
      if (mounted) {
        // Navigate to Login or Home based on auth state
        Navigator.of(context).pushReplacementNamed('/login');
      }
    });
  }

  @override
  void dispose() {
    _animationController.dispose();
    _navigationTimer?.cancel();
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
  'assets/images/Logo (2).svg',
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