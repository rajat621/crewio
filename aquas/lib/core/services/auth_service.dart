import 'package:dio/dio.dart';
import '../network/api_client.dart';
import '../services/token_service.dart';
import '../../data/models/auth_response_model.dart';
import '../../data/models/user_model.dart';

class AuthService {
  final ApiClient apiClient;
  final TokenService tokenService;

  AuthService({
    required this.apiClient,
    required this.tokenService,
  });

  // Login user
  Future<UserModel> login({
    required String employeeId,
    required String password,
  }) async {
    try {
      final response = await apiClient.post(
        '/api/mobile/auth/login',
        data: {
          'employeeId': employeeId,
          'password': password,
        },
      );

      if (response.statusCode == 200) {
        final authResponse = AuthResponseModel.fromJson(response.data);

        await tokenService.saveAccessToken(authResponse.accessToken);
        if (authResponse.refreshToken != null) {
          await tokenService.saveRefreshToken(authResponse.refreshToken!);
        }
        await tokenService.saveUserId(authResponse.user.id);

        return authResponse.user;
      } else {
        throw Exception('Login failed: ${response.statusMessage}');
      }
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  // Employee accounts are created by the office/admin from the dashboard,
  // not self-registered from the app. Kept here so the call site fails
  // loudly and clearly instead of silently hitting a non-existent route.
  Future<UserModel> register({
    required String email,
    required String password,
    required String name,
    String? phone,
  }) async {
    throw UnsupportedError(
      'Employees cannot self-register. Ask your office admin to create your account.',
    );
  }

  // Refresh access token using the stored refresh token
  Future<String> refreshToken() async {
    try {
      final refresh = await tokenService.getRefreshToken();
      if (refresh == null || refresh.isEmpty) {
        throw Exception('No refresh token available');
      }

      final response = await apiClient.post(
        '/api/mobile/auth/refresh',
        data: {'refreshToken': refresh},
      );

      if (response.statusCode == 200) {
        final authResponse = AuthResponseModel.fromJson(response.data);
        await tokenService.saveAccessToken(authResponse.accessToken);
        if (authResponse.refreshToken != null) {
          await tokenService.saveRefreshToken(authResponse.refreshToken!);
        }
        return authResponse.accessToken;
      } else {
        throw Exception('Token refresh failed');
      }
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  // Logout user
  Future<void> logout() async {
    try {
      await apiClient.post('/api/mobile/auth/logout');
    } catch (e) {
      // Ignore errors during logout, just clear local tokens
    } finally {
      await tokenService.clearAll();
    }
  }

  // Check if user is authenticated
  Future<bool> isAuthenticated() async {
    return await tokenService.hasToken();
  }

  String _handleDioError(DioException error) {
    if (error.response != null) {
      final data = error.response?.data;
      final message = (data is Map ? data['message'] : null) ?? 'An error occurred';
      return message;
    } else if (error.type == DioExceptionType.connectionTimeout) {
      return 'Connection timeout. Please check your internet connection.';
    } else if (error.type == DioExceptionType.receiveTimeout) {
      return 'Server took too long to respond.';
    } else {
      return error.message ?? 'An unexpected error occurred';
    }
  }
}
