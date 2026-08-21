// lib/data/models/chat/voice_message_model.dart
//
// A voice note that has been recorded locally but not yet uploaded/sent.
// Distinct from ChatMessageModel (which is the persisted, server-confirmed
// message): this is purely client-side state produced by
// VoiceRecorderService and consumed by ChatService.sendVoice().
class VoiceRecording {
  final String localFilePath;
  final Duration duration;

  const VoiceRecording({required this.localFilePath, required this.duration});

  int get durationSeconds => duration.inSeconds;
}
