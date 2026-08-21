// lib/config/theme/app_colors.dart

import 'package:flutter/material.dart';

class AppColors {
  // Primary Colors
  static const Color primaryBlue = Color(0xFF1E40AF);
  static const Color lightBlue = Color(0xFF3B82F6);
  static const Color darkBlue = Color(0xFF1F2937);
  
  // Status Colors
  static const Color successGreen = Color(0xFF22C55E);
  static const Color warningYellow = Color(0xFFEAB308);
  static const Color errorRed = Color(0xFFEF4444);
  static const Color infoBlue = Color(0xFF0EA5E9);
  
  // Background Colors
  static const Color bgPrimary = Color(0xFFF3F0FF);      // Light lavender
  static const Color bgWhite = Color(0xFFFFFFFF);
  static const Color bgGray = Color(0xFFF3F4F6);
  static const Color bgLightGray = Color(0xFFF9FAFB);
  
  // Text Colors
  static const Color textDark = Color(0xFF1F2937);
  static const Color textGray = Color(0xFF6B7280);
  static const Color textLight = Color(0xFF9CA3AF);
  static const Color textWhite = Color(0xFFFFFFFF);
  
  // Border Colors
  static const Color borderGray = Color(0xFFE5E7EB);
  static const Color borderLight = Color(0xFFF3F4F6);
  
  // Gradient Colors
  static const List<Color> greenGradient = [
    Color(0xFF10B981),
    Color(0xFF059669),
  ];
  
  static const List<Color> redGradient = [
    Color(0xFFF87171),
    Color(0xFFEF4444),
  ];
  
  static const List<Color> yellowGradient = [
    Color(0xFFFCD34D),
    Color(0xFFEAB308),
  ];
  
  static const List<Color> blueGradient = [
    Color(0xFF60A5FA),
    Color(0xFF3B82F6),
  ];
}