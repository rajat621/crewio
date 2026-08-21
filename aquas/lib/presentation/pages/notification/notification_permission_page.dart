// lib/presentation/pages/notification/notification_permission_page.dart
//
// Onboarding step: requested once, immediately after the location
// permission step (see location_permission_page.dart), and never shown
// again afterwards - whatever the user picks here (or dismisses as
// "Skip") is respected for the rest of the app's life. If they want to
// change their mind later they can do so from the OS notification
// settings (which "Open Settings" below deep-links to when the choice
// was "Don't allow" / permanently denied).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../../config/theme/app_colors.dart';
import '../../../config/theme/app_text_styles.dart';
import '../../../service_locator.dart';

class NotificationPermissionPage extends StatefulWidget {
  const NotificationPermissionPage({super.key});

  @override
  State<NotificationPermissionPage> createState() =>
      _NotificationPermissionPageState();
}

class _NotificationPermissionPageState
    extends State<NotificationPermissionPage> {
  bool _requesting = false;

  Future<void> _goHome() async {
    if (!mounted) return;
    Navigator.of(context).pushReplacementNamed('/home');
  }

  Future<void> _handleAllow() async {
    if (_requesting) return;
    setState(() => _requesting = true);

    try {
      // On iOS this is the actual system prompt. On Android 13+ this is
      // the POST_NOTIFICATIONS runtime permission; on Android 12 and
      // below it resolves as already-granted since no runtime prompt
      // exists there.
      final status = await Permission.notification.status;

      PermissionStatus result = status;
      if (!status.isGranted && !status.isPermanentlyDenied) {
        result = await Permission.notification.request();
      }

      if (result.isPermanentlyDenied && mounted) {
        // The user (or a prior install) already said "Don't ask again" -
        // a second in-app request would just silently no-op, so the only
        // way forward is the OS settings screen.
        await _showPermanentlyDeniedDialog();
        return;
      }

      // Whether granted or denied (not permanently), this is a one-time
      // onboarding step either way - kick off FCM registration now if
      // granted, then move on. PushNotificationService itself also
      // degrades gracefully if permission ends up denied.
      if (result.isGranted) {
        // Fire-and-forget: don't block onboarding on network/FCM setup.
        unawaited(ServiceLocator().pushNotificationService.initialize());
      }
    } catch (_) {
      // Ignore - worst case the user just doesn't get push notifications.
    }

    await _goHome();
  }

  Future<void> _showPermanentlyDeniedDialog() async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Notifications are turned off'),
        content: const Text(
          'You previously denied notification access. Open Settings to turn '
          'on notifications so you never miss a salary slip, site '
          'assignment, or office message.',
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              _goHome();
            },
            child: const Text('Not now'),
          ),
          TextButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await openAppSettings();
              await _goHome();
            },
            child: const Text('Open Settings'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const SizedBox(height: 40),
              Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  color: AppColors.primaryBlue.withAlpha((0.1 * 255).round()),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: AppColors.primaryBlue.withAlpha((0.2 * 255).round()),
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Container(
                        width: 70,
                        height: 70,
                        decoration: const BoxDecoration(
                          color: AppColors.warningYellow,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          LucideIcons.bellRing,
                          color: AppColors.bgWhite,
                          size: 40,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 40),
              Text(
                'Stay updated',
                style: AppTextStyles.headingLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Text(
                'Get notified the moment your salary slip is ready, you\'re '
                'assigned to a site, or your office sends you a message.',
                style: AppTextStyles.bodyMedium.copyWith(
                  color: AppColors.textGray,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 60),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _requesting ? null : _handleAllow,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryBlue,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: _requesting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor:
                                AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : Text('Allow notifications', style: AppTextStyles.buttonLarge),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _requesting ? null : _goHome,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.primaryBlue,
                    side: const BorderSide(
                      color: AppColors.primaryBlue,
                      width: 2,
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: Text(
                    'Skip for now',
                    style: AppTextStyles.buttonLarge.copyWith(
                      color: AppColors.primaryBlue,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }
}
