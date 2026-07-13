import 'package:dio/dio.dart';
import '../network/api_client.dart';
import '../../data/models/mobile_models.dart';

class NotificationService {
  final ApiClient apiClient;

  NotificationService({required this.apiClient});

  Future<List<NotificationModel>> getNotifications() async {
    try {
      final response = await apiClient.get('/api/notifications');
      final List data = response.data['data'] as List? ?? [];
      return data.map((e) => NotificationModel.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  Future<void> markRead(String id) async {
    try {
      await apiClient.post('/api/notifications/$id/read');
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
