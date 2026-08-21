import 'package:dio/dio.dart';
import '../network/api_client.dart';
import '../../data/models/user_model.dart';

class ProfileService {
  final ApiClient apiClient;

  ProfileService({required this.apiClient});

  Future<UserModel> getMyProfile() async {
    try {
      final response = await apiClient.get('/api/mobile/profile');
      return UserModel.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  /// Only avatar, mobile, countryCode, address, and city are editable by the
  /// employee - anything else is set by the office admin from the dashboard.
  Future<UserModel> updateMyProfile(Map<String, dynamic> updates) async {
    try {
      final response = await apiClient.patch('/api/mobile/profile', data: updates);
      return UserModel.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  /// Submits a deactivation request to the employee's Organization admin.
  /// This does NOT delete the account or any business records (attendance,
  /// payroll, timesheets, audit logs are the employer's records, not the
  /// employee's, and are retained per the Organization's retention
  /// policy) - it only notifies the dashboard admin, who can then
  /// deactivate access, reset credentials, archive, or - only if
  /// organizational policy and legal retention requirements allow -
  /// permanently remove the employee record.
  Future<void> requestAccountDeactivation({String? reason}) async {
    try {
      await apiClient.post(
        '/api/mobile/account/deactivation-request',
        data: {
          if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
          'requestedAt': DateTime.now().toUtc().toIso8601String(),
        },
      );
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  String _message(DioException error) {
    final data = error.response?.data;
    return (data is Map ? data['message'] : null)?.toString() ??
        error.message ??
        'Something went wrong. Please try again.';
  }
}
