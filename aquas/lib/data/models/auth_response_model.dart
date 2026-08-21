import 'package:freezed_annotation/freezed_annotation.dart';
import 'user_model.dart';

part 'auth_response_model.freezed.dart';
part 'auth_response_model.g.dart';

@freezed
class AuthResponseModel with _$AuthResponseModel {
  const factory AuthResponseModel({
    required UserModel user,
    @JsonKey(name: 'accessToken') required String accessToken,
    @JsonKey(name: 'refreshToken') String? refreshToken,
  }) = _AuthResponseModel;

  factory AuthResponseModel.fromJson(Map<String, dynamic> json) =>
      _$AuthResponseModelFromJson(json);
}
