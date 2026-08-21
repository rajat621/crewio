// lib/core/services/voice_recorder_service.dart
//
// Thin wrapper around the `record` package for capturing chat voice notes.
// Always records compressed AAC-in-m4a (never WAV - a few seconds of WAV
// would blow past VOICE_MAX_BYTES on the backend for no audio-quality
// benefit in a business chat). Enforces the same max-duration ceiling the
// backend validates on upload, auto-stopping the recording rather than
// letting the user record something the server will reject.
import 'dart:async';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';
import '../../data/models/chat/voice_message_model.dart';

class VoiceRecorderService {
  // Kept in sync with chat.controller.js's VOICE_MAX_DURATION_SECONDS.
  static const int maxDurationSeconds = 300;

  final AudioRecorder _recorder = AudioRecorder();
  Timer? _maxDurationTimer;
  DateTime? _startedAt;
  String? _currentPath;

  /// Fires once when the max duration is hit and recording is auto-stopped,
  /// so the UI can finish the "release to send" gesture on the caller's
  /// behalf instead of leaving the user holding a dead mic button.
  void Function()? onMaxDurationReached;

  bool get isRecording => _startedAt != null;

  Future<bool> hasPermission() => _recorder.hasPermission();

  Future<void> start() async {
    if (isRecording) return;
    if (!await hasPermission()) {
      throw Exception('Microphone permission was not granted');
    }

    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/voice_note_${DateTime.now().millisecondsSinceEpoch}.m4a';

    await _recorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000, sampleRate: 44100),
      path: path,
    );

    _currentPath = path;
    _startedAt = DateTime.now();
    _maxDurationTimer = Timer(const Duration(seconds: maxDurationSeconds), () async {
      if (!isRecording) return;
      await stop();
      onMaxDurationReached?.call();
    });
  }

  /// Stops recording and returns the finished note, or null if nothing
  /// meaningful was captured (e.g. released almost instantly).
  Future<VoiceRecording?> stop() async {
    if (!isRecording) return null;
    _maxDurationTimer?.cancel();
    _maxDurationTimer = null;

    final startedAt = _startedAt!;
    _startedAt = null;
    final path = await _recorder.stop();
    final duration = DateTime.now().difference(startedAt);

    final finalPath = path ?? _currentPath;
    _currentPath = null;
    if (finalPath == null || duration.inMilliseconds < 500) {
      if (finalPath != null) await _deleteQuietly(finalPath);
      return null;
    }

    return VoiceRecording(localFilePath: finalPath, duration: duration);
  }

  /// Discards the in-progress recording (e.g. user swipes to cancel).
  Future<void> cancel() async {
    if (!isRecording) return;
    _maxDurationTimer?.cancel();
    _maxDurationTimer = null;
    _startedAt = null;
    final path = await _recorder.stop();
    final target = path ?? _currentPath;
    _currentPath = null;
    if (target != null) await _deleteQuietly(target);
  }

  Future<void> _deleteQuietly(String path) async {
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();
    } catch (_) {
      // Best-effort cleanup only - a leftover temp file is not worth
      // surfacing an error to the user over.
    }
  }

  Future<void> dispose() async {
    _maxDurationTimer?.cancel();
    await _recorder.dispose();
  }
}
