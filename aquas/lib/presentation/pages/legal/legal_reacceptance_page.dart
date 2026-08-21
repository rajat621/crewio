// lib/presentation/pages/legal/legal_reacceptance_page.dart
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../config/theme/app_colors.dart';
import '../../../config/theme/app_text_styles.dart';
import '../../../core/legal/legal_acceptance_service.dart';
import '../../../service_locator.dart';
import '../../widgets/legal/legal_acceptance_checklist.dart';

/// Shown right after a successful login when LegalAcceptanceService
/// determines the backend now requires a newer legal-document version than
/// what this worker last accepted (spec section 4: "Legal Version
/// Management"). The worker's credentials/session are already valid at
/// this point - this screen only gates entry into the rest of the app,
/// it does not re-authenticate them.
class LegalReacceptancePage extends StatefulWidget {
  final VoidCallback onAccepted;

  const LegalReacceptancePage({super.key, required this.onAccepted});

  @override
  State<LegalReacceptancePage> createState() => _LegalReacceptancePageState();
}

class _LegalReacceptancePageState extends State<LegalReacceptancePage> {
  bool _checked = false;
  bool _submitting = false;
  String? _error;

  Future<void> _submit() async {
    if (!_checked) {
      setState(() => _error = 'Please review and accept the updated documents to continue.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final service = ServiceLocator().legalAcceptanceService;
      await service.recordAcceptance();
      if (!mounted) return;
      widget.onAccepted();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Something went wrong saving your acceptance. Please try again.';
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // Workers cannot back out of this screen without accepting - there's
      // nowhere useful to go back to (they're already authenticated).
      canPop: false,
      child: Scaffold(
        backgroundColor: AppColors.bgPrimary,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(LucideIcons.fileText, size: 40, color: AppColors.primaryBlue),
                const SizedBox(height: 16),
                Text('Updated Legal Agreements', style: AppTextStyles.headingMedium),
                const SizedBox(height: 8),
                Text(
                  'Our legal agreements have been updated. Please review and accept '
                  'them to continue using the app. Your login and account are not '
                  'affected.',
                  style: AppTextStyles.bodyMedium.copyWith(color: AppColors.textGray),
                ),
                const SizedBox(height: 24),
                Expanded(
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AppColors.bgWhite,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      children: [
                        Expanded(
                          child: Center(
                            child: LegalAcceptanceChecklist(
                              checked: _checked,
                              onChanged: (value) => setState(() {
                                _checked = value;
                                _error = null;
                              }),
                            ),
                          ),
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 8),
                          Text(_error!,
                              style: AppTextStyles.bodySmall.copyWith(color: Colors.red)),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primaryBlue,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: _submitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(AppColors.bgWhite),
                            ),
                          )
                        : Text('Continue', style: AppTextStyles.buttonLarge),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Convenience: checks whether re-acceptance is needed and, if so, pushes
/// [LegalReacceptancePage] before calling [proceed]; otherwise calls
/// [proceed] immediately. Call this right after a successful login instead
/// of navigating straight to '/home' or '/permission'.
Future<void> guardLegalReacceptance(
  BuildContext context, {
  required VoidCallback proceed,
}) async {
  final service = ServiceLocator().legalAcceptanceService;
  final needsReacceptance = await service.needsAcceptance();
  if (!context.mounted) return;

  if (!needsReacceptance) {
    proceed();
    return;
  }

  Navigator.of(context).pushReplacement(
    MaterialPageRoute(
      builder: (context) => LegalReacceptancePage(onAccepted: proceed),
    ),
  );
}
