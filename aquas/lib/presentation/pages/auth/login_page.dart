// // lib/presentation/pages/auth/login_page.dart

// import 'package:flutter/material.dart';
// import 'package:flutter/services.dart';
// import 'package:flutter_riverpod/flutter_riverpod.dart';
// import 'package:lucide_icons_flutter/lucide_icons.dart';
// import '../../../config/theme/app_colors.dart';
// import '../../../config/theme/app_text_styles.dart';
// import '../../../presentation/providers/auth_provider.dart';

// class LoginPage extends ConsumerStatefulWidget {
//   const LoginPage({super.key});

//   @override
//   ConsumerState<LoginPage> createState() => _LoginPageState();
// }

// class _LoginPageState extends ConsumerState<LoginPage> {
//   late TextEditingController _employeeIdController;
//   late TextEditingController _passwordController;
//   late FocusNode _employeeIdFocus;
//   late FocusNode _passwordFocus;

//   bool _isPasswordVisible = false;
//   String? _errorMessage;

//   @override
//   void initState() {
//     super.initState();
//     _employeeIdController = TextEditingController();
//     _passwordController = TextEditingController();
//     _employeeIdFocus = FocusNode();
//     _passwordFocus = FocusNode();
//   }

//   @override
//   void dispose() {
//     _employeeIdController.dispose();
//     _passwordController.dispose();
//     _employeeIdFocus.dispose();
//     _passwordFocus.dispose();
//     super.dispose();
//   }

//   void _handleLogin() async {
//     // Temporary design-mode bypass: skip validation and backend auth.
//     setState(() => _errorMessage = null);

//     if (!mounted) return;

//     Navigator.of(context).pushReplacementNamed('/home');
//   }

//   @override
//   Widget build(BuildContext context) {
//     // Watch auth state
//     final authState = ref.watch(authProvider);
//     final displayError = _errorMessage ?? authState.error;

//     // Login (and Splash) use a dark blue status bar to match the brand
//     // background; every other screen in the app keeps the white status
//     // bar set globally in main.dart.
//     return AnnotatedRegion<SystemUiOverlayStyle>(
//       value: const SystemUiOverlayStyle(
//         statusBarColor: Color(0xFF1E40AF),
//         statusBarIconBrightness: Brightness.light,
//         statusBarBrightness: Brightness.dark, // iOS
//         systemNavigationBarColor: Color(0xFF1E40AF),
//         systemNavigationBarIconBrightness: Brightness.light,
//       ),
//       child: Scaffold(
//         backgroundColor: AppColors.primaryBlue,
//         body: SafeArea(
//           child: SingleChildScrollView(
//             child: Padding(
//               padding: const EdgeInsets.all(24.0),
//               child: Column(
//                 mainAxisAlignment: MainAxisAlignment.center,
//                 children: [
//                   const SizedBox(height: 40),
//                   // Logo
//                   Container(
//                     width: 120,
//                     height: 120,
//                     decoration: BoxDecoration(
//                       color: const Color(0xFF1F3B7E),
//                       borderRadius: BorderRadius.circular(16),
//                     ),
//                     child: Column(
//                       mainAxisAlignment: MainAxisAlignment.center,
//                       children: const [
//                         Text(
//                           'AQAS',
//                           style: TextStyle(
//                             fontSize: 32,
//                             fontWeight: FontWeight.bold,
//                             color: AppColors.warningYellow,
//                             fontFamily: 'Poppins',
//                           ),
//                         ),
//                         SizedBox(height: 4),
//                         Text(
//                           'TOGETHER WE BUILD',
//                           style: TextStyle(
//                             fontSize: 10,
//                             color: AppColors.warningYellow,
//                             fontFamily: 'Poppins',
//                           ),
//                         ),
//                       ],
//                     ),
//                   ),
//                   const SizedBox(height: 60),
//                   // Login Form Container
//                   Container(
//                     decoration: BoxDecoration(
//                       color: AppColors.bgWhite,
//                       borderRadius: BorderRadius.circular(20),
//                     ),
//                     padding: const EdgeInsets.all(24),
//                     child: Column(
//                       crossAxisAlignment: CrossAxisAlignment.start,
//                       children: [
//                         // Title
//                         Text(
//                           'Log In',
//                           style: AppTextStyles.headingMedium,
//                         ),
//                         const SizedBox(height: 8),
//                         Text(
//                           'Enter your Employee ID and password',
//                           style: AppTextStyles.bodySmall.copyWith(
//                             color: AppColors.textGray,
//                           ),
//                         ),
//                         const SizedBox(height: 24),

//                         // Error Message
//                         if (displayError != null)
//                           Container(
//                             width: double.infinity,
//                             padding: const EdgeInsets.all(12),
//                             decoration: BoxDecoration(
//                               color: AppColors.errorRed.withAlpha(
//                                 (0.1 * 255).round(),
//                               ),
//                               borderRadius: BorderRadius.circular(8),
//                               border: Border.all(color: AppColors.errorRed),
//                             ),
//                             child: Text(
//                               displayError,
//                               style: AppTextStyles.bodySmall.copyWith(
//                                 color: AppColors.errorRed,
//                               ),
//                             ),
//                           ),
//                         if (displayError != null) const SizedBox(height: 16),

//                         // Employee ID Field
//                         Column(
//                           crossAxisAlignment: CrossAxisAlignment.start,
//                           children: [
//                             Text(
//                               'Employee ID',
//                               style: AppTextStyles.labelLarge,
//                             ),
//                             const SizedBox(height: 8),
//                             TextField(
//                               controller: _employeeIdController,
//                               focusNode: _employeeIdFocus,
//                               enabled: !authState.isLoading,
//                               decoration: InputDecoration(
//                                 hintText: 'e.g. EID-TEST-5968',
//                                 prefixIcon: const Icon(LucideIcons.badgeCheck),
//                               ),
//                               textInputAction: TextInputAction.next,
//                               onSubmitted: (_) {
//                                 _passwordFocus.requestFocus();
//                               },
//                             ),
//                           ],
//                         ),
//                         const SizedBox(height: 16),

//                         // Password Field
//                         Column(
//                           crossAxisAlignment: CrossAxisAlignment.start,
//                           children: [
//                             Text(
//                               'Password',
//                               style: AppTextStyles.labelLarge,
//                             ),
//                             const SizedBox(height: 8),
//                             TextField(
//                               controller: _passwordController,
//                               focusNode: _passwordFocus,
//                               enabled: !authState.isLoading,
//                               obscureText: !_isPasswordVisible,
//                               decoration: InputDecoration(
//                                 hintText: 'Enter your password',
//                                 prefixIcon: const Icon(LucideIcons.lock),
//                                 suffixIcon: IconButton(
//                                   icon: Icon(
//                                     _isPasswordVisible
//                                         ? LucideIcons.eye
//                                         : LucideIcons.eyeOff,
//                                   ),
//                                   onPressed: () {
//                                     setState(() {
//                                       _isPasswordVisible = !_isPasswordVisible;
//                                     });
//                                   },
//                                 ),
//                               ),
//                               textInputAction: TextInputAction.done,
//                               onSubmitted: (_) => _handleLogin(),
//                             ),
//                           ],
//                         ),
//                         const SizedBox(height: 24),

//                         // Login Button
//                         SizedBox(
//                           width: double.infinity,
//                           child: ElevatedButton(
//                             onPressed:
//                                 authState.isLoading ? null : _handleLogin,
//                             style: ElevatedButton.styleFrom(
//                               backgroundColor: AppColors.primaryBlue,
//                               padding: const EdgeInsets.symmetric(
//                                 vertical: 14,
//                               ),
//                             ),
//                             child: authState.isLoading
//                                 ? const SizedBox(
//                                     height: 20,
//                                     width: 20,
//                                     child: CircularProgressIndicator(
//                                       strokeWidth: 2,
//                                       valueColor: AlwaysStoppedAnimation<Color>(
//                                         AppColors.bgWhite,
//                                       ),
//                                     ),
//                                   )
//                                 : Text(
//                                     'Log In',
//                                     style: AppTextStyles.buttonLarge,
//                                   ),
//                           ),
//                         ),
//                       ],
//                     ),
//                   ),
//                   const SizedBox(height: 40),
//                 ],
//               ),
//             ),
//           ),
//         ),
//       ),
//     );
//   }
// }
// lib/presentation/pages/auth/login_page.dart

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../config/theme/app_colors.dart';
import '../../../config/theme/app_text_styles.dart';
import '../../../presentation/providers/auth_provider.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  late TextEditingController _employeeIdController;
  late TextEditingController _passwordController;
  late FocusNode _employeeIdFocus;
  late FocusNode _passwordFocus;

  bool _isPasswordVisible = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _employeeIdController = TextEditingController();
    _passwordController = TextEditingController();
    _employeeIdFocus = FocusNode();
    _passwordFocus = FocusNode();
  }

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

    // Backend looks this up against the Emirates ID / App Access ID on the
    // employee's dashboard profile, then checks the password set there.
    await ref.read(authProvider.notifier).login(employeeId, password);

    if (!mounted) return;

    final authState = ref.read(authProvider);
    if (authState.isAuthenticated) {
      // If user has no recorded lastLocation, ask for location permission
      final needLocation = authState.user?.lastLocation == null;
      if (needLocation) {
        Navigator.of(context).pushReplacementNamed('/permission');
      } else {
        Navigator.of(context).pushReplacementNamed('/home');
      }
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
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(height: 40),
                  // Logo
                  Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      color: const Color(0xFF1F3B7E),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        Text(
                          'AQAS',
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.bold,
                            color: AppColors.warningYellow,
                            fontFamily: 'Poppins',
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'TOGETHER WE BUILD',
                          style: TextStyle(
                            fontSize: 10,
                            color: AppColors.warningYellow,
                            fontFamily: 'Poppins',
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 60),
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
                              border: Border.all(color: AppColors.errorRed),
                            ),
                            child: Text(
                              displayError,
                              style: AppTextStyles.bodySmall.copyWith(
                                color: AppColors.errorRed,
                              ),
                            ),
                          ),
                        if (displayError != null) const SizedBox(height: 16),

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
                              enabled: !authState.isLoading,
                              decoration: InputDecoration(
                                hintText: 'e.g. 784-1990-1234567-1',
                                prefixIcon: const Icon(LucideIcons.badgeCheck),
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
                              enabled: !authState.isLoading,
                              obscureText: !_isPasswordVisible,
                              decoration: InputDecoration(
                                hintText: 'Enter your password',
                                prefixIcon: const Icon(LucideIcons.lock),
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    _isPasswordVisible
                                        ? LucideIcons.eye
                                        : LucideIcons.eyeOff,
                                  ),
                                  onPressed: () {
                                    setState(() {
                                      _isPasswordVisible = !_isPasswordVisible;
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

                        // Login Button
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed:
                                authState.isLoading ? null : _handleLogin,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primaryBlue,
                              padding: const EdgeInsets.symmetric(
                                vertical: 14,
                              ),
                            ),
                            child: authState.isLoading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      valueColor: AlwaysStoppedAnimation<Color>(
                                        AppColors.bgWhite,
                                      ),
                                    ),
                                  )
                                : Text(
                                    'Log In',
                                    style: AppTextStyles.buttonLarge,
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

