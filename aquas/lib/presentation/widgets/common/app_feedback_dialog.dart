// lib/presentation/widgets/common/app_feedback_dialog.dart
//
// Centralized replacement for error/status SnackBars. Per the production
// checklist, SnackBars should not be used to surface errors (or internal
// connection-status chatter) - only for optional success confirmations.
// Everything else routes through here as a small, consistent dialog instead
// of scattering ScaffoldMessenger.showSnackBar(...) calls (often with raw
// exception text like 'Could not start work: $e') across every screen.

import 'package:flutter/material.dart';
import '../../../config/theme/app_colors.dart';
import '../../../core/errors/error_message_mapper.dart';

class AppFeedbackDialog {
  /// A hard failure with a pre-written, already-safe message (no exception
  /// text baked in) - e.g. "Could not mark all as read. Try again."
  static Future<void> showError(
    BuildContext context, {
    String title = 'Something went wrong',
    required String message,
  }) {
    return _show(
      context,
      title: title,
      message: message,
      accent: AppColors.errorRed,
      icon: Icons.error_outline,
    );
  }

  /// A hard failure caused by a caught exception. This is the one every
  /// catch block should use - it never lets the raw exception (hostnames,
  /// status codes, stack traces, `DioException: ...`) reach the screen.
  /// `action` is a short, human description of what failed, e.g.
  /// "Check-in failed" - the exception itself only decides which safe,
  /// pre-written sentence follows it.
  static Future<void> showException(
    BuildContext context,
    Object error, {
    String title = 'Something went wrong',
    String? action,
  }) {
    final reason = ErrorMessageMapper.toUserMessage(error);
    final message = action == null ? reason : '$action. $reason';
    return _show(
      context,
      title: title,
      message: message,
      accent: AppColors.errorRed,
      icon: Icons.error_outline,
    );
  }

  /// A non-fatal heads-up (e.g. "you're offline, this will sync later").
  /// Same visual language as showError but with the warning accent, so the
  /// two are trivially distinguishable at a glance rather than needing
  /// different UI patterns.
  static Future<void> showNotice(
    BuildContext context, {
    String title = 'Heads up',
    required String message,
  }) {
    return _show(
      context,
      title: title,
      message: message,
      accent: AppColors.warningYellow,
      icon: Icons.info_outline,
    );
  }

  static Future<void> _show(
    BuildContext context, {
    required String title,
    required String message,
    required Color accent,
    required IconData icon,
  }) {
    return showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(icon, color: accent, size: 22),
            const SizedBox(width: 10),
            Expanded(child: Text(title)),
          ],
        ),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

}