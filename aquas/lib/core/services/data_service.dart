import 'package:dio/dio.dart';
import '../network/api_client.dart';
import '../../data/models/user_model.dart';

class DataService {
  final ApiClient apiClient;

  DataService({required this.apiClient});

  // Get current user profile
  Future<UserModel> getCurrentUser() async {
    try {
      final response = await apiClient.get('/api/users/me');

      if (response.statusCode == 200) {
        return UserModel.fromJson(response.data);
      } else {
        throw Exception('Failed to fetch current user');
      }
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  // Get user by ID
  Future<UserModel> getUserById(String userId) async {
    try {
      final response = await apiClient.get('/api/users/$userId');

      if (response.statusCode == 200) {
        return UserModel.fromJson(response.data);
      } else {
        throw Exception('User not found');
      }
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  // Get all users (with pagination)
  Future<List<UserModel>> getAllUsers({
    int page = 1,
    int limit = 10,
  }) async {
    try {
      final response = await apiClient.get(
        '/api/users',
        queryParameters: {
          'page': page,
          'limit': limit,
        },
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = response.data['users'] ?? response.data;
        return data.map((e) => UserModel.fromJson(e as Map<String, dynamic>)).toList();
      } else {
        throw Exception('Failed to fetch users');
      }
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  // Check in attendance
  Future<void> checkIn({
    required double latitude,
    required double longitude,
  }) async {
    try {
      final response = await apiClient.post(
        '/api/attendance/check-in',
        data: {
          'location': {
            'type': 'Point',
            'coordinates': [longitude, latitude],
          },
        },
      );

      if (response.statusCode != 201 && response.statusCode != 200) {
        throw Exception('Check-in failed');
      }
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  // Check out attendance
  Future<void> checkOut({
    required double latitude,
    required double longitude,
  }) async {
    try {
      final response = await apiClient.post(
        '/api/attendance/check-out',
        data: {
          'location': {
            'type': 'Point',
            'coordinates': [longitude, latitude],
          },
        },
      );

      if (response.statusCode != 201 && response.statusCode != 200) {
        throw Exception('Check-out failed');
      }
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  // Get attendance records
  Future<List<dynamic>> getAttendanceRecords({
    int page = 1,
    int limit = 10,
  }) async {
    try {
      final response = await apiClient.get(
        '/api/attendance',
        queryParameters: {
          'page': page,
          'limit': limit,
        },
      );

      if (response.statusCode == 200) {
        return response.data['records'] ?? response.data;
      } else {
        throw Exception('Failed to fetch attendance records');
      }
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  // Handle Dio exceptions
  String _handleDioError(DioException error) {
    if (error.response != null) {
      final message = error.response?.data['message'] ?? 'An error occurred';
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
