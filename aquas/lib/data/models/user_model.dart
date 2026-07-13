import 'package:freezed_annotation/freezed_annotation.dart';

part 'user_model.freezed.dart';
part 'user_model.g.dart';

@freezed
class UserModel with _$UserModel {
  const factory UserModel({
    @JsonKey(name: '_id') required String id,
    required String employeeId,
    String? email,
    required String name,
    String? phone,
    @Default('active') String status,
    @JsonKey(name: 'createdAt') String? createdAt,
    @JsonKey(name: 'lastSeen') String? lastSeen,
    @JsonKey(name: 'lastLocation') Map<String, dynamic>? lastLocation,
    String? avatar,
  }) = _UserModel;

  factory UserModel.fromJson(Map<String, dynamic> json) =>
      _$UserModelFromJson(json);
}