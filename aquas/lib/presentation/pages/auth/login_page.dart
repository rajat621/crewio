// lib/presentation/pages/auth/login_page.dart

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../config/theme/app_colors.dart';
import '../../../config/theme/app_text_styles.dart';
import '../../../core/legal/legal_acceptance_service.dart';
import '../../../presentation/providers/auth_provider.dart';
import '../../../service_locator.dart';
import '../../widgets/legal/legal_acceptance_checklist.dart';
import '../legal/legal_reacceptance_page.dart';
import 'package:flutter_svg/flutter_svg.dart';
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  LegalAcceptanceService get _legalService => ServiceLocator().legalAcceptanceService;

  late TextEditingController _employeeIdController;
  late TextEditingController _passwordController;
  late FocusNode _employeeIdFocus;
  late FocusNode _passwordFocus;

  bool _isPasswordVisible = false;
  String? _errorMessage;

  // Whether the checkbox on THIS screen is currently ticked.
  bool _termsChecked = false;
  // Whether the worker has already accepted the CURRENT bundled legal
  // version on this device - once true, we stop blocking login on the
  // checkbox (still shown, just informational) so returning workers
  // aren't re-prompted every single time they log in. A version bump is
  // handled separately, after login, by guardLegalReacceptance().
  bool _termsPreviouslyAccepted = false;
  bool _loadingTermsState = true;

  @override
  void initState() {
    super.initState();
    _employeeIdController = TextEditingController();
    _passwordController = TextEditingController();
    _employeeIdFocus = FocusNode();
    _passwordFocus = FocusNode();
    _loadTermsState();
  }

  Future<void> _loadTermsState() async {
    try {
      final accepted = await _legalService.hasAcceptedCurrentBundledVersion();
      if (!mounted) return;
      setState(() {
        _termsPreviouslyAccepted = accepted;
        _loadingTermsState = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingTermsState = false);
    }
  }

  bool get _canSubmit => _termsChecked || _termsPreviouslyAccepted;

  @override
  void dispose() {
    _employeeIdController.dispose();
    _passwordController.dispose();
    _employeeIdFocus.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final employeeId = _employeeIdController.text.trim();
    final password = _passwordController.text;

    setState(() => _errorMessage = null);

    if (employeeId.isEmpty || password.isEmpty) {
      setState(() => _errorMessage = 'Please enter your Employee ID and password');
      return;
    }

    if (!_canSubmit) {
      setState(() => _errorMessage =
          'Please accept the Privacy Policy, Terms & Conditions, Terms of Use, '
          'Cookie Policy, Data Processing Agreement, Security & Privacy Policy, '
          'and Consent to Data Processing to continue.');
      return;
    }

    // Backend looks this up against the Emirates ID / App Access ID on the
    // employee's dashboard profile, then checks the password set there.
    await ref.read(authProvider.notifier).login(employeeId, password);

    if (!mounted) return;

    final authState = ref.read(authProvider);
    if (authState.isAuthenticated) {
      if (!_termsPreviouslyAccepted) {
        // Writes the acceptance record locally (acceptedAt, version,
        // appVersion, devicePlatform, deviceModel, userAgent) and syncs it
        // to the backend audit log. Never blocks login on the network call.
        await _legalService.recordAcceptance();
      } else {
        // Opportunistically flush an earlier acceptance that was recorded
        // locally but never made it to the backend (e.g. logged in while
        // offline last time).
        unawaited(_legalService.retryPendingSyncIfAny());
      }

      if (!mounted) return;

      // If user has no recorded lastLocation, ask for location permission
      final needLocation = authState.user?.lastLocation == null;
      final destinationRoute = needLocation ? '/permission' : '/home';

      // Section 4: if the backend now requires a newer legal version than
      // what was just recorded (only possible if it was bumped server-side
      // after this app build shipped), force review before proceeding.
      // Credentials/session are already valid - this only gates the app.
      await guardLegalReacceptance(
        context,
        proceed: () {
          if (!mounted) return;
          Navigator.of(context).pushReplacementNamed(destinationRoute);
        },
      );
    }
    // On failure, authState.error is already surfaced by the `displayError`
    // read in build() below - nothing else to do here.
  }

  @override
  Widget build(BuildContext context) {
    // Watch auth state
    final authState = ref.watch(authProvider);
    final displayError = _errorMessage ?? authState.error;

    // Login (and Splash) use a dark blue status bar to match the brand
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
body: SafeArea(
  child: LayoutBuilder(
    builder: (context, constraints) {
      return SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            minHeight: constraints.maxHeight,
          ),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Logo
                  SizedBox(
                    width: 208,
                    height: 46,
                    child: SvgPicture.asset(
                      'assets/images/logo_login.svg',
                      fit: BoxFit.contain,
                    ),
                  ),

                  const SizedBox(height: 32),

                  // Login Form Container
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.bgWhite,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Title
                        Text(
                          'Log In',
                          style: AppTextStyles.headingMedium,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Enter your Employee ID and password',
                          style: AppTextStyles.bodySmall.copyWith(
                            color: AppColors.textGray,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'This app only works if your organization uses CrewControl to manage attendance.',
                          style: AppTextStyles.labelSmall.copyWith(
                            color: AppColors.textGray,
                          ),
                        ),
                        const SizedBox(height: 24),

                        // Error Message
                        if (displayError != null)
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppColors.errorRed.withAlpha(
                                (0.1 * 255).round(),
                              ),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: AppColors.errorRed,
                              ),
                            ),
                            child: Text(
                              displayError,
                              style: AppTextStyles.bodySmall.copyWith(
                                color: AppColors.errorRed,
                              ),
                            ),
                          ),

                        if (displayError != null)
                          const SizedBox(height: 16),

                        // Employee ID Field
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Employee ID (Emirates ID)',
                              style: AppTextStyles.labelLarge,
                            ),
                            const SizedBox(height: 8),
                            TextField(
                              controller: _employeeIdController,
                              focusNode: _employeeIdFocus,
                              enabled: true,
                              decoration: InputDecoration(
                                hintText: 'e.g. 784-1990-1234567-1',
                                prefixIcon: const Icon(
                                  LucideIcons.badgeCheck,
                                ),
                              ),
                              textInputAction: TextInputAction.next,
                              onSubmitted: (_) {
                                _passwordFocus.requestFocus();
                              },
                            ),
                          ],
                        ),

                        const SizedBox(height: 16),

                        // Password Field
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Password',
                              style: AppTextStyles.labelLarge,
                            ),
                            const SizedBox(height: 8),
                            TextField(
                              controller: _passwordController,
                              focusNode: _passwordFocus,
                              enabled: true,
                              obscureText: !_isPasswordVisible,
                              decoration: InputDecoration(
                                hintText: 'Enter your password',
                                prefixIcon: const Icon(
                                  LucideIcons.lock,
                                ),
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    _isPasswordVisible
                                        ? LucideIcons.eye
                                        : LucideIcons.eyeOff,
                                  ),
                                  onPressed: () {
                                    setState(() {
                                      _isPasswordVisible =
                                          !_isPasswordVisible;
                                    });
                                  },
                                ),
                              ),
                              textInputAction: TextInputAction.done,
                              onSubmitted: (_) => _handleLogin(),
                            ),
                          ],
                        ),

                        const SizedBox(height: 24),

                        if (_loadingTermsState)
                          const SizedBox.shrink()
                        else
                          LegalAcceptanceChecklist(
                            checked: _termsChecked || _termsPreviouslyAccepted,
                            readOnly: _termsPreviouslyAccepted,
                            onChanged: (value) {
                              setState(() {
                                _termsChecked = value;
                                _errorMessage = null;
                              });
                            },
                          ),

                        const SizedBox(height: 16),

                        // Login Button
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed:
                                (authState.isLoading ||
                                        !_canSubmit)
                                    ? null
                                    : _handleLogin,
                            style:
                                ElevatedButton.styleFrom(
                              backgroundColor:
                                  AppColors.primaryBlue,
                              padding:
                                  const EdgeInsets.symmetric(
                                vertical: 14,
                              ),
                            ),
                            child: authState.isLoading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child:
                                        CircularProgressIndicator(
                                      strokeWidth: 2,
                                      valueColor:
                                          AlwaysStoppedAnimation<
                                              Color>(
                                        AppColors.bgWhite,
                                      ),
                                    ),
                                  )
                                : Text(
                                    'Log In',
                                    style: AppTextStyles
                                        .buttonLarge,
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  ),
),
      ),
    );
  }
}