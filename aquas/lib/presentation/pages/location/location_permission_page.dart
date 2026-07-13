// lib/presentation/pages/location/location_permission_page.dart

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
// import 'package:permission_handler/permission_handler.dart';
import 'package:geolocator/geolocator.dart';
import '../../../service_locator.dart';
import '../../../config/theme/app_colors.dart';
import '../../../config/theme/app_text_styles.dart';

class LocationPermissionPage extends StatefulWidget {
  const LocationPermissionPage({super.key});

  @override
  State<LocationPermissionPage> createState() => _LocationPermissionPageState();
}

class _LocationPermissionPageState extends State<LocationPermissionPage> {
  void _handleAllowLocation() {
    _requestAndSendLocation();
  }

  void _handleSkipLocation() {
    if (!mounted) return;
    Navigator.of(context).pushReplacementNamed('/home');
  }
  
Future<void> _requestAndSendLocation() async {
  try {
    // Check if location services (GPS) are enabled
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();

    if (!serviceEnabled) {
      await Geolocator.openLocationSettings();

      if (!mounted) return;
      Navigator.of(context).pushReplacementNamed('/home');
      return;
    }

    // Request permission
    LocationPermission permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    // if (permission == LocationPermission.denied ||
    //     permission == LocationPermission.deniedForever) {
    //   if (permission == LocationPermission.deniedForever) {
    //     await Geolocator.openAppSettings();
    //   }
    //   if (!mounted) return;
    //   Navigator.of(context).pushReplacementNamed('/home');
    //   return;
    // }

if (permission == LocationPermission.denied) {
  if (!mounted) return;
  Navigator.of(context).pushReplacementNamed('/home');
  return;
}

if (permission == LocationPermission.deniedForever) {
  await Geolocator.openAppSettings();

  if (!mounted) return;
  Navigator.of(context).pushReplacementNamed('/home');
  return;
}
 

    // Get current location
    final pos = await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.best,
    );

    // Send location to backend
    try {
      await ServiceLocator().attendanceService.pingLocation(
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy: pos.accuracy,
      );
    } catch (_) {
      // Ignore backend errors
    }
  } catch (_) {
    // Ignore unexpected errors
  }

  if (!mounted) return;
  Navigator.of(context).pushReplacementNamed('/home');
}
  // Future<void> _requestAndSendLocation() async {
  //   // Request permission
  //   final status = await Permission.locationWhenInUse.request();
  //   if (status.isGranted) {
  //     try {
  //       final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.best);
  //       // Send a ping to the backend so the user's lastLocation is recorded
  //       try {
  //         await ServiceLocator().attendanceService.pingLocation(
  //           lat: pos.latitude,
  //           lng: pos.longitude,
  //           accuracy: pos.accuracy,
  //         );
  //       } catch (_) {
  //         // best-effort - don't block navigation on ping failure
  //       }
  //     } catch (_) {
  //       // ignore location fetch errors
  //     }
  //   }
  //   if (!mounted) return;
  //   Navigator.of(context).pushReplacementNamed('/home');
  // }

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
                          LucideIcons.mapPin,
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
                'Allow maps to access your location while you use the app?',
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
                  onPressed: () => _handleAllowLocation(),
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
                  onPressed: () => _handleSkipLocation(),
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
