import 'dart:io';
import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';
import '../network/api_client.dart';
import '../../data/models/chat/message_model.dart';
import '../../data/models/chat/voice_message_model.dart';

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

  /// Sends a text message to the office/owner (no recipient needed - the
  /// backend resolves "my office" from the employee's own token). Returns
  /// the server-confirmed message so the caller can merge it into local
  /// state by id instead of guessing at one.
  Future<ChatMessageModel> send(String text, String myId) async {
    try {
      final response = await apiClient.post('/api/chat/send', data: {'text': text});
      final data = response.data?['data'] as Map<String, dynamic>?;
      if (data == null) throw Exception('Empty response from server');
      return ChatMessageModel.fromJson(data, myId);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  /// Uploads a recorded voice note and sends it as a message. Same
  /// "server confirms, caller merges by id" contract as [send].
  Future<ChatMessageModel> sendVoice(VoiceRecording recording, String myId) async {
    try {
      final file = File(recording.localFilePath);
      final formData = FormData.fromMap({
        'duration': recording.durationSeconds,
        'file': await MultipartFile.fromFile(
          file.path,
          filename: 'voice-note.m4a',
          contentType: MediaType('audio', 'mp4'),
        ),
      });
      final response = await apiClient.post('/api/chat/send-voice', data: formData);
      final data = response.data?['data'] as Map<String, dynamic>?;
      if (data == null) throw Exception('Empty response from server');
      return ChatMessageModel.fromJson(data, myId);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  String _message(DioException error) {
    final data = error.response?.data;
    final serverMessage = (data is Map ? data['message'] : null)?.toString();
    if (serverMessage != null && serverMessage.isNotEmpty) return serverMessage;

    // DNS failures, timeouts, and dropped connections all surface here as a
    // raw "SocketException: Failed host lookup..." style string - never
    // show that directly, translate it into something a non-technical
    // person can act on instead.
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return 'Unable to reach the server. Check your internet connection and try again.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}
