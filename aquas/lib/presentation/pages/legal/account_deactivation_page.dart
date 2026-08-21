// lib/presentation/pages/legal/account_deactivation_page.dart
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../config/theme/app_colors.dart';
import '../../../config/theme/app_text_styles.dart';
import '../../../service_locator.dart';

/// Section 8 of the compliance spec: employees cannot permanently delete
/// their own account or business records (payroll, attendance, timesheets,
/// invoices, compliance/audit logs belong to the employer). Instead this
/// screen lets them submit a deactivation REQUEST that notifies their
/// Organization's dashboard administrator, who decides what happens next.
class AccountDeactivationPage extends StatefulWidget {
  const AccountDeactivationPage({super.key});

  @override
  State<AccountDeactivationPage> createState() => _AccountDeactivationPageState();
}

class _AccountDeactivationPageState extends State<AccountDeactivationPage> {
  final _reasonController = TextEditingController();
  bool _submitting = false;
  bool _submitted = false;
  String? _error;

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ServiceLocator().profileService.requestAccountDeactivation(
            reason: _reasonController.text,
          );
      if (!mounted) return;
      setState(() => _submitted = true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      appBar: AppBar(
        backgroundColor: AppColors.bgWhite,
        elevation: 0,
        title: const Text('Request Account Deactivation'),
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(LucideIcons.chevronLeft),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: _submitted ? _buildSuccessState() : _buildFormState(),
      ),
    );
  }

  Widget _buildSuccessState() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(LucideIcons.checkCircle2, size: 56, color: Color(0xFF16A34A)),
          const SizedBox(height: 16),
          Text('Request Submitted', style: AppTextStyles.headingMedium),
          const SizedBox(height: 8),
          Text(
            'Your Organization\'s administrator has been notified. They will '
            'review your request and take the appropriate action.',
            textAlign: TextAlign.center,
            style: AppTextStyles.bodyMedium.copyWith(color: AppColors.textGray),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Done'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFormState() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF7ED),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFFDBA74)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(LucideIcons.info, color: Color(0xFFC2410C), size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Your employee records (attendance, payroll, timesheets, and '
                    'audit logs) are maintained by your Organization and can\'t be '
                    'deleted directly from this app. Deleting your account isn\'t '
                    'available here - submitting this request notifies your '
                    'Organization\'s administrator instead.',
                    style: AppTextStyles.bodySmall.copyWith(color: const Color(0xFF9A3412)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Text('What happens next', style: AppTextStyles.labelLarge),
          const SizedBox(height: 8),
          _bullet('Your administrator is notified of this request.'),
          _bullet('They may deactivate your access, reset your credentials, or archive your profile.'),
          _bullet('Your account may be permanently removed only if your organization\'s policies and legal retention requirements allow it.'),
          _bullet('When deactivated: login is blocked and push tokens are revoked immediately, but attendance, payroll, timesheet, and audit records remain intact as required by law.'),
          const SizedBox(height: 20),
          Text('Reason (optional)', style: AppTextStyles.labelLarge),
          const SizedBox(height: 8),
          TextField(
            controller: _reasonController,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'Let your administrator know why, if you\'d like',
              border: OutlineInputBorder(),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: AppTextStyles.bodySmall.copyWith(color: Colors.red)),
          ],
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.errorRed,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : const Text('Submit Deactivation Request',
                      style: TextStyle(color: Colors.white)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _bullet(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: 6, right: 8),
            child: Icon(LucideIcons.dot, size: 14, color: AppColors.textGray),
          ),
          Expanded(
            child: Text(text, style: AppTextStyles.bodySmall.copyWith(color: AppColors.textGray)),
          ),
        ],
      ),
    );
  }
}
