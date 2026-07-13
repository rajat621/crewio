// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$UserModelImpl _$$UserModelImplFromJson(Map<String, dynamic> json) =>
    _$UserModelImpl(
      id: json['_id'] as String,
      employeeId: json['employeeId'] as String,
      email: json['email'] as String?,
      name: json['name'] as String,
      phone: json['phone'] as String?,
      status: json['status'] as String? ?? 'active',
      createdAt: json['createdAt'] as String?,
      lastSeen: json['lastSeen'] as String?,
      lastLocation: json['lastLocation'] as Map<String, dynamic>?,
      avatar: json['avatar'] as String?,
    );

Map<String, dynamic> _$$UserModelImplToJson(_$UserModelImpl instance) =>
    <String, dynamic>{
      '_id': instance.id,
      'employeeId': instance.employeeId,
      'email': instance.email,
      'name': instance.name,
      'phone': instance.phone,
      'status': instance.status,
      'createdAt': instance.createdAt,
      'lastSeen': instance.lastSeen,
      'lastLocation': instance.lastLocation,
      'avatar': instance.avatar,
    };
