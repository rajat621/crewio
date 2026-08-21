// lib/core/services/audio_player_service.dart
//
// Thin wrapper around `just_audio` for playing back chat voice notes.
// Deliberately holds a SINGLE shared AudioPlayer for the whole chat screen
// so starting playback on one voice bubble always stops any other bubble
// that's currently playing - never two notes playing over each other.
import 'package:just_audio/just_audio.dart';
import '../network/api_client.dart';

class AudioPlayerService {
  final ApiClient apiClient;
  final AudioPlayer _player = AudioPlayer();

  /// The chat message id currently loaded/playing, or null if idle.
  String? _activeMessageId;

  AudioPlayerService({required this.apiClient});

  Stream<PlayerState> get playerStateStream => _player.playerStateStream;
  Stream<Duration> get positionStream => _player.positionStream;
  Duration? get duration => _player.duration;
  String? get activeMessageId => _activeMessageId;

  bool isActive(String messageId) => _activeMessageId == messageId;

  /// Plays the voice note at [voiceUrlPath] (a relative API path like
  /// `/api/chat/voice/<id>`), identified by [messageId] for UI state. If
  /// this message is already the one loaded, toggles play/pause instead of
  /// reloading it from the network every tap.
  Future<void> playOrToggle(String messageId, String voiceUrlPath) async {
    if (_activeMessageId == messageId) {
      if (_player.playing) {
        await _player.pause();
      } else {
        await _player.play();
      }
      return;
    }

    _activeMessageId = messageId;
    final token = await apiClient.tokenService.getAccessToken();
    final base = apiClient.baseUrl.replaceAll(RegExp(r'/api/?$'), '');
    final url = '$base$voiceUrlPath?token=${Uri.encodeComponent(token ?? '')}';

    await _player.setUrl(url);
    await _player.play();
  }

  Future<void> stop() async {
    _activeMessageId = null;
    await _player.stop();
  }

  Future<void> dispose() async {
    await _player.dispose();
  }
}
