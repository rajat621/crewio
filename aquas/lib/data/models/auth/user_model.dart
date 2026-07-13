// lib/data/models/auth/user_model.dart

import '../../../domain/entities/auth/user_entity.dart';

class UserModel {
  final String userId;
  final String name;
  final String employeeId;
  final String email;
  final String phone;
  final String? profileImage;
  final String siteId;
  final String role;
  final bool isActive;

  UserModel({
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

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      userId: json['userId'] as String,
      name: json['name'] as String,
      employeeId: json['employeeId'] as String,
      email: json['email'] as String,
      phone: json['phone'] as String,
      profileImage: json['profileImage'] as String?,
      siteId: json['siteId'] as String,
      role: json['role'] as String,
      isActive: json['isActive'] as bool,
    );
  }

  Map<String, dynamic> toJson() => {
    'userId': userId,
    'name': name,
    'employeeId': employeeId,
    'email': email,
    'phone': phone,
    'profileImage': profileImage,
    'siteId': siteId,
    'role': role,
    'isActive': isActive,
  };

  UserEntity toEntity() => UserEntity(
    userId: userId,
    name: name,
    employeeId: employeeId,
    email: email,
    phone: phone,
    profileImage: profileImage,
    siteId: siteId,
    role: role,
    isActive: isActive,
  );
}