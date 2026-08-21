// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'auth_response_model.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$AuthResponseModelImpl _$$AuthResponseModelImplFromJson(
  Map<String, dynamic> json,
) => _$AuthResponseModelImpl(
  user: UserModel.fromJson(json['user'] as Map<String, dynamic>),
  accessToken: json['accessToken'] as String,
  refreshToken: json['refreshToken'] as String?,
);

Map<String, dynamic> _$$AuthResponseModelImplToJson(
  _$AuthResponseModelImpl instance,
) => <String, dynamic>{
  'user': instance.user,
  'accessToken': instance.accessToken,
  'refreshToken': instance.refreshToken,
};
