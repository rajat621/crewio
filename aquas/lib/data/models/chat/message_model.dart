// lib/data/models/chat/message_model.dart
//
// Wire model for one message in the employee <-> office thread. Mirrors
// backend/src/models/Chat.js: a message is either plain text
// (messageType == 'text') or a voice note (messageType == 'voice', with
// voiceUrl/duration set and text empty). Kept deliberately simple (no
// freezed/json_serializable) to match the style already used by
// ChatMessageModel in mobile_models.dart elsewhere in this app.
class ChatMessageModel {
  final String id;
  final String from;
  final String to;
  final String text;
  final String messageType; // 'text' | 'voice'
  final String? voiceUrl; // relative API path, e.g. /api/chat/voice/<id>
  final int? duration; // seconds, voice notes only
  final DateTime createdAt;
  final bool isMine;

  const ChatMessageModel({
    required this.id,
    required this.from,
    required this.to,
    required this.text,
    required this.messageType,
    required this.createdAt,
    required this.isMine,
    this.voiceUrl,
    this.duration,
  });

  bool get isVoice => messageType == 'voice';

  factory ChatMessageModel.fromJson(Map<String, dynamic> json, String myId) {
    final from = json['from']?.toString() ?? '';
    return ChatMessageModel(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      from: from,
      to: json['to']?.toString() ?? '',
      text: json['text']?.toString() ?? '',
      messageType: json['messageType']?.toString() ?? 'text',
      voiceUrl: json['voiceUrl']?.toString(),
      duration: json['duration'] == null ? null : int.tryParse(json['duration'].toString()),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '')?.toLocal() ?? DateTime.now(),
      isMine: from == myId,
    );
  }
}
