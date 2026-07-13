import 'package:dio/dio.dart';
import '../network/api_client.dart';
import '../../data/models/mobile_models.dart';

class ChatService {
  final ApiClient apiClient;

  ChatService({required this.apiClient});

  /// Fetches the employee's single conversation thread with their office/owner.
  /// [myId] is the logged-in employee's own id (from TokenService.getUserId()),
  /// used only to flag which messages are "mine" for the UI - the backend
  /// scopes this to the caller's own thread regardless of what's passed.
  Future<List<ChatMessageModel>> getThread(String myId) async {
    try {
      final response = await apiClient.get('/api/chat/thread');
      final List data = response.data['data'] as List? ?? [];
      final messages = data
          .map((e) => ChatMessageModel.fromJson(e as Map<String, dynamic>, myId))
          .toList();
      // Backend returns newest-first; reverse for a natural chat-log order.
      return messages.reversed.toList();
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  /// Sends a message to the office/owner (no recipient needed - the backend
  /// resolves "my office" from the employee's own token).
  Future<void> send(String text) async {
    try {
      await apiClient.post('/api/chat/send', data: {'text': text});
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
