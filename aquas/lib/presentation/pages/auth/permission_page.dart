// lib/presentation/pages/location/location_permission_page.dart

import 'package:flutter/material.dart';
import '../../../config/theme/app_colors.dart';
import '../../../config/theme/app_text_styles.dart';

class LocationPermissionPage extends StatelessWidget {
  const LocationPermissionPage({super.key});

  void _handleAllowLocation(BuildContext context) {
    // TODO: Request location permission
    Navigator.of(context).pushReplacementNamed('/home');
  }

  void _handleSkipLocation(BuildContext context) {
    Navigator.of(context).pushReplacementNamed('/home');
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
              
              // Location Icon
              Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  color: AppColors.successGreen.withAlpha((0.1 * 255).round()),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: AppColors.successGreen.withAlpha((0.2 * 255).round()),
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Container(
                        width: 70,
                        height: 70,
                        decoration: BoxDecoration(
                          color: AppColors.warningYellow,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.location_on,
                          color: AppColors.bgWhite,
                          size: 40,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              
              const SizedBox(height: 40),
              
              // Title
              Text(
                'Location',
                style: AppTextStyles.headingLarge,
                textAlign: TextAlign.center,
              ),
              
              const SizedBox(height: 16),
              
              // Description
              Text(
                'Allow maps to access your location whiloe you use the app?',
                style: AppTextStyles.bodyMedium.copyWith(
                  color: AppColors.textGray,
                ),
                textAlign: TextAlign.center,
              ),
              
              const SizedBox(height: 60),
              
              // Allow Button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => _handleAllowLocation(context),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryBlue,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: Text(
                    'Allow',
                    style: AppTextStyles.buttonLarge,
                  ),
                ),
              ),
              
              const SizedBox(height: 12),
              
              // Skip Button
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => _handleSkipLocation(context),
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