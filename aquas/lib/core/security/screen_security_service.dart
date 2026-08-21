// lib/core/security/screen_security_service.dart
//
// Blocks screenshots/screen recording (and hides content from the
// recent-apps switcher thumbnail) on Android while a "sensitive" screen
// is on top of the stack - spec section 9: "Disable screenshots on
// sensitive screens if appropriate."
//
// iOS deliberately has no equivalent API - Apple doesn't let apps block
// the screenshot gesture. iOS apps can only detect
// `UIApplication.userDidTakeScreenshotNotification` after the fact and/or
// blur content in the app switcher; that's a separate, larger platform
// integration this pass doesn't add given the low severity for a
// workforce app (unlike e.g. a banking app), but the hook point below
// (`ScreenSecurityService.enable/disable`) is exactly where you'd add it
// if that changes.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
class ScreenSecurityService {
  static const _channel = MethodChannel('com.crewcontrol/secure_screen');

  static Future<void> enable() async {
    try {
      await _channel.invokeMethod('enable');
    } catch (_) {
      // iOS (method not implemented) or any platform channel hiccup -
      // non-fatal, the screen just isn't protected on this platform/build.
    }
  }

  static Future<void> disable() async {
    try {
      await _channel.invokeMethod('disable');
    } catch (_) {}
  }
}

/// Mixin for any State that shows sensitive financial/PII content
/// (salary figures, bank/advance details, etc.) - enables screenshot
/// protection while the screen is visible and disables it again on exit,
/// so it doesn't leak into unrelated screens.
mixin ScreenshotProtection<T extends StatefulWidget> on State<T> {
  @override
  void initState() {
    super.initState();
    ScreenSecurityService.enable();
  }

  @override
  void dispose() {
    ScreenSecurityService.disable();
    super.dispose();
  }
}
