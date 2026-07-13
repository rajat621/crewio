// lib/presentation/pages/profile/profile_page.dart

import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../config/theme/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../../service_locator.dart';
import '../../../data/models/user_model.dart';

class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key});

  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  bool _darkMode = false;
  // Notifications on by default per request.
  bool _notifications = true;
  UserModel? _profile;
  bool _uploadingAvatar = false;

  // Accent used for the avatar glyph and the switch thumbs in the
  // reference design (a dark slate/navy, distinct from the app's primary
  // blue).
  static const Color _accent = Color(0xFF4B4768);

  @override
  Widget build(BuildContext context) {
    // Fetch live profile if not loaded
    if (_profile == null) {
      ServiceLocator().profileService.getMyProfile().then((p) {
        if (mounted) setState(() => _profile = p);
      }).catchError((_) {});
    }
    final mq = MediaQuery.of(context);
    final sw = mq.size.width;
    final sh = mq.size.height;
    const baseW = 412.0;
    const baseH = 917.0;
    final sx = sw / baseW;
    final sy = sh / baseH;
    final sf = sx < sy ? sx : sy;

    double w(double v) => v * sx;
    double h(double v) => v * sy;
    double f(double v) => v * sf;

    final authState = ref.watch(authProvider);

    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      body: Column(
        children: [
          // White wrapper so the status bar area renders white on every
          // device, matching the rest of the app.
          Container(
            width: double.infinity,
            color: AppColors.bgWhite,
            child: SafeArea(
              bottom: false,
              child: _buildHeader(context, w, h, f),
            ),
          ),
          Expanded(
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                padding: EdgeInsets.fromLTRB(w(16), h(28), w(16), h(24)),
                child: Column(
                  children: [
                    _buildAvatar(w, h),
                    SizedBox(height: h(16)),
                    Text(
                      _profile?.name ?? authState.user?.name ?? '—',
                      style: TextStyle(
                        color: const Color(0xFF141414),
                        fontSize: f(26),
                        fontWeight: FontWeight.w600,
                        fontFamily: 'Sans Serif',
                      ),
                    ),
                    SizedBox(height: h(4)),
                    Text(
                      _profile?.employeeId ?? authState.user?.employeeId ?? '',
                      style: TextStyle(
                        color: const Color(0xFF8A87A0),
                        fontSize: f(16),
                        fontWeight: FontWeight.w400,
                        fontFamily: 'Sans Serif',
                      ),
                    ),
                    SizedBox(height: h(20)),
                    _buildTradeRateRow(w, h, f),
                    SizedBox(height: h(20)),
                    Container(
                      width: double.infinity,
                      height: 1,
                      color: const Color(0xFFD7D5E3),
                    ),
                    SizedBox(height: h(20)),
                    _buildInfoCard(w, h, f),
                    SizedBox(height: h(20)),
                    _buildToggleRow(
                      w: w,
                      h: h,
                      f: f,
                      icon: LucideIcons.moon,
                      label: 'Dark mode',
                      value: _darkMode,
                      onChanged: (v) => setState(() => _darkMode = v),
                    ),
                    SizedBox(height: h(14)),
                    _buildToggleRow(
                      w: w,
                      h: h,
                      f: f,
                      icon: LucideIcons.moon,
                      label: 'Notification',
                      value: _notifications,
                      onChanged: (v) => setState(() => _notifications = v),
                    ),
                    SizedBox(height: h(48)),
                    _buildLogoutButton(w, h, f),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(
    BuildContext context,
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    return Container(
      height: h(68),
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(w(14), h(8), w(14), h(8)),
      decoration: const BoxDecoration(
        color: AppColors.bgWhite,
        border: Border(bottom: BorderSide(color: Color(0xFFD7D7D7), width: 1)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: Icon(
              LucideIcons.arrowLeft,
              size: w(26),
              color: const Color(0xFF1E1E1E),
            ),
            padding: EdgeInsets.zero,
            constraints: BoxConstraints.tightFor(width: w(36), height: w(36)),
          ),
          Expanded(
            child: Text(
              'My Profile',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: const Color(0xFF141414),
                fontSize: f(24),
                fontWeight: FontWeight.w500,
                fontFamily: 'Sans Serif',
              ),
            ),
          ),
          SizedBox(width: w(36)),
        ],
      ),
    );
  }

  Widget _buildAvatar(double Function(double) w, double Function(double) h) {
    final avatar = _profile?.avatar;
    ImageProvider? avatarImage;
    if (avatar != null && avatar.isNotEmpty) {
      if (avatar.startsWith('data:')) {
        try {
          final base64Part = avatar.substring(avatar.indexOf(',') + 1);
          avatarImage = MemoryImage(base64Decode(base64Part));
        } catch (_) {
          avatarImage = null;
        }
      } else {
        avatarImage = NetworkImage(avatar);
      }
    }

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: w(140),
          height: w(140),
          decoration: BoxDecoration(
            color: const Color(0xFFD9D7E0),
            shape: BoxShape.circle,
            image: avatarImage != null
                ? DecorationImage(image: avatarImage, fit: BoxFit.cover)
                : null,
          ),
          child: avatarImage == null
              ? Icon(LucideIcons.user, size: w(82), color: _accent)
              : null,
        ),
        if (_uploadingAvatar)
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                color: Colors.black38,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: SizedBox(
                  width: 28,
                  height: 28,
                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                ),
              ),
            ),
          ),
        Positioned(
          bottom: 0,
          right: w(2),
          child: GestureDetector(
            onTap: _uploadingAvatar ? null : _showAvatarSourcePicker,
            child: Container(
              width: w(40),
              height: w(40),
              decoration: BoxDecoration(
                color: AppColors.bgWhite,
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFCFCDDA), width: 1.5),
              ),
              child: Icon(LucideIcons.camera, size: w(18), color: const Color(0xFF5C5972)),
            ),
          ),
        ),
      ],
    );
  }

  // Bottom sheet offering "Take Photo" / "Choose from Gallery", matching
  // the standard picker pattern. Each option requests the relevant OS
  // permission first (camera, or photo library) and shows a clear message
  // if the user has permanently denied it, with a shortcut to Settings.
  void _showAvatarSourcePicker() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFDADADA),
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(LucideIcons.camera, color: _accent),
                title: const Text('Take Photo'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _pickAndUploadAvatar(ImageSource.camera);
                },
              ),
              ListTile(
                leading: const Icon(LucideIcons.image, color: _accent),
                title: const Text('Upload Image'),
                onTap: () {
                  Navigator.pop(sheetContext);
                  _pickAndUploadAvatar(ImageSource.gallery);
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  Future<void> _pickAndUploadAvatar(ImageSource source) async {
    final permission = source == ImageSource.camera ? Permission.camera : Permission.photos;

    final status = await permission.request();
    if (!status.isGranted) {
      // On Android, gallery access via image_picker's system photo picker
      // (Android 13+) doesn't require the `photos` runtime permission at
      // all - only fall back to the "denied" message when the permission
      // is genuinely required and was refused, not just unsupported.
      if (source == ImageSource.camera || status.isPermanentlyDenied) {
        if (!mounted) return;
        _showPermissionDeniedDialog(
          source == ImageSource.camera ? 'Camera' : 'Photos',
          isPermanent: status.isPermanentlyDenied,
        );
        return;
      }
    }

    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(
        source: source,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 70,
      );
      if (picked == null) return;

      setState(() => _uploadingAvatar = true);

      final bytes = await File(picked.path).readAsBytes();
      final base64Str = base64Encode(bytes);
      final ext = picked.path.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
      final dataUri = 'data:image/$ext;base64,$base64Str';

      final updated = await ServiceLocator().profileService.updateMyProfile({'avatar': dataUri});
      if (!mounted) return;
      setState(() {
        _profile = updated;
        _uploadingAvatar = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _uploadingAvatar = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not update photo: $e')),
      );
    }
  }

  void _showPermissionDeniedDialog(String permissionName, {required bool isPermanent}) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('$permissionName access needed'),
        content: Text(
          isPermanent
              ? '$permissionName access is currently disabled for this app. Please enable it in Settings to continue.'
              : '$permissionName access is required to update your profile photo.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          if (isPermanent)
            TextButton(
              onPressed: () {
                Navigator.pop(context);
                openAppSettings();
              },
              child: const Text('Open Settings'),
            ),
        ],
      ),
    );
  }

  Widget _buildTradeRateRow(
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    return IntrinsicHeight(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Expanded(
            child: _buildLabelValue(f, 'Trade', 'Carpenter'),
          ),
          Container(width: 1, color: const Color(0xFFD7D5E3)),
          Expanded(
            child: _buildLabelValue(f, 'Rate / hr', 'AED 9.00'),
          ),
        ],
      ),
    );
  }

  Widget _buildLabelValue(
    double Function(double) f,
    String label,
    String value,
  ) {
    return Column(
      children: [
        Text(
          label,
          style: TextStyle(
            color: const Color(0xFF8A87A0),
            fontSize: f(16),
            fontWeight: FontWeight.w400,
            fontFamily: 'Sans Serif',
          ),
        ),
        const SizedBox(height: 6),
        Text(
          value,
          style: TextStyle(
            color: const Color(0xFF141414),
            fontSize: f(19),
            fontWeight: FontWeight.w500,
            fontFamily: 'Sans Serif',
          ),
        ),
      ],
    );
  }

  Widget _buildInfoCard(
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(horizontal: w(18), vertical: h(16)),
      decoration: BoxDecoration(
        color: AppColors.bgWhite,
        borderRadius: BorderRadius.circular(w(16)),
        border: Border.all(color: const Color(0xFFDEDEDE), width: 1),
      ),
      child: Column(
        children: [
          _buildInfoRow(f, 'Mobile Number :', _profile?.phone ?? '-'),
          SizedBox(height: h(16)),
          _buildInfoRow(f, 'Joining Date:', _formatDateOnly(_profile?.createdAt)),
          SizedBox(height: h(16)),
          _buildInfoRow(f, 'Status:', _profile?.status ?? '-'),
          SizedBox(height: h(16)),
          _buildInfoRow(f, 'Nationality:', '-'),
        ],
      ),
    );
  }

  // Joining Date should show just the date (e.g. "15 Jun 2026"), not the
  // full ISO timestamp the backend sends.
  String _formatDateOnly(String? iso) {
    if (iso == null || iso.isEmpty) return '-';
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return '-';
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${parsed.day} ${months[parsed.month - 1]} ${parsed.year}';
  }

  Widget _buildInfoRow(double Function(double) f, String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            color: const Color(0xFF8A87A0),
            fontSize: f(17),
            fontWeight: FontWeight.w400,
            fontFamily: 'Sans Serif',
          ),
        ),
        Text(
          value,
          style: TextStyle(
            color: const Color(0xFF141414),
            fontSize: f(18),
            fontWeight: FontWeight.w600,
            fontFamily: 'Sans Serif',
          ),
        ),
      ],
    );
  }

  Widget _buildToggleRow({
    required double Function(double) w,
    required double Function(double) h,
    required double Function(double) f,
    required IconData icon,
    required String label,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Row(
      children: [
        Icon(icon, size: w(22), color: _accent),
        SizedBox(width: w(12)),
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              color: const Color(0xFF5C5972),
              fontSize: f(18),
              fontWeight: FontWeight.w400,
              fontFamily: 'Sans Serif',
            ),
          ),
        ),
        Switch(
          value: value,
          onChanged: onChanged,
          activeColor: _accent,
          inactiveThumbColor: _accent,
          inactiveTrackColor: const Color(0xFFDADADA),
        ),
      ],
    );
  }

  Widget _buildLogoutButton(
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    return SizedBox(
      width: double.infinity,
      height: h(58),
      child: OutlinedButton(
        onPressed: () {
          showDialog(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Logout'),
              content: const Text('Are you sure you want to logout?'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel'),
                ),
                TextButton(
                  onPressed: () {
                    Navigator.pop(context);
                    Navigator.of(context).pushReplacementNamed('/login');
                  },
                  child: const Text(
                    'Logout',
                    style: TextStyle(color: AppColors.errorRed),
                  ),
                ),
              ],
            ),
          );
        },
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primaryBlue,
          side: const BorderSide(color: AppColors.primaryBlue, width: 1.5),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(w(14)),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.logOut, size: w(20), color: AppColors.primaryBlue),
            SizedBox(width: w(10)),
            Text(
              'Log Out',
              style: TextStyle(
                color: AppColors.primaryBlue,
                fontSize: f(19),
                fontWeight: FontWeight.w600,
                fontFamily: 'Sans Serif',
              ),
            ),
          ],
        ),
      ),
    );
  }
}