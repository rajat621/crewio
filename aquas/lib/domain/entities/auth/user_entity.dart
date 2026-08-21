// lib/domain/entities/auth/user_entity.dart

class UserEntity {
  final String userId;
  final String name;
  final String employeeId;
  final String email;
  final String phone;
  final String? profileImage;
  final String siteId;
  final String role; // 'labor', 'supervisor', 'admin'
  final bool isActive;

  const UserEntity({
    required this.userId,
    required this.name,
    required this.employeeId,
    required this.email,
    required this.phone,
    this.profileImage,
    required this.siteId,
    required this.role,
    required this.isActive,
  });
}