import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'core/network/api_client.dart';
import 'core/network/websocket_service.dart';
import 'core/services/token_service.dart';
import 'core/services/auth_service.dart';
import 'core/services/attendance_service.dart';
import 'core/services/attendance_offline_queue.dart';
import 'core/services/chat_service.dart';
import 'core/services/audio_player_service.dart';
import 'core/services/salary_service.dart';
import 'core/services/notification_service.dart';
import 'core/services/profile_service.dart';
import 'core/services/push_notification_service.dart';
import 'core/services/realtime_service.dart';
import 'core/services/connectivity_watcher.dart';
import 'core/legal/legal_acceptance_service.dart';
import 'presentation/providers/auth_provider.dart';

// Service Locator Configuration
class ServiceLocator {
  static final ServiceLocator _instance = ServiceLocator._internal();

  late TokenService _tokenService;
  late ApiClient _apiClient;
  late AuthService _authService;
  late AttendanceService _attendanceService;
  late AttendanceOfflineQueue _attendanceOfflineQueue;
  late ChatService _chatService;
  late ChatWebSocketService _chatSocketService;
  late AudioPlayerService _audioPlayerService;
  late SalaryService _salaryService;
  late NotificationService _notificationService;
  late ProfileService _profileService;
  late PushNotificationService _pushNotificationService;
  late RealtimeService _realtimeService;
  late ConnectivityWatcher _connectivityWatcher;
  late LegalAcceptanceService _legalAcceptanceService;

  factory ServiceLocator() {
    return _instance;
  }

  ServiceLocator._internal();

  // Getters
  TokenService get tokenService => _tokenService;
  ApiClient get apiClient => _apiClient;
  AuthService get authService => _authService;
  AttendanceService get attendanceService => _attendanceService;
  AttendanceOfflineQueue get attendanceOfflineQueue => _attendanceOfflineQueue;
  ChatService get chatService => _chatService;
  ChatWebSocketService get chatSocketService => _chatSocketService;
  AudioPlayerService get audioPlayerService => _audioPlayerService;
  SalaryService get salaryService => _salaryService;
  NotificationService get notificationService => _notificationService;
  ProfileService get profileService => _profileService;
  PushNotificationService get pushNotificationService => _pushNotificationService;
  RealtimeService get realtimeService => _realtimeService;
  ConnectivityWatcher get connectivityWatcher => _connectivityWatcher;
  LegalAcceptanceService get legalAcceptanceService => _legalAcceptanceService;

  Future<void> setup() async {
    // Release builds (e.g. the one uploaded to Play Store) load .env.prod;
    // debug/profile builds load .env.dev. Previously this always loaded
    // .env.dev regardless of build type, which meant a release build could
    // silently ship pointed at a LAN/testing API URL instead of production
    // - see .env.dev's own comments, which describe it as being for local
    // Chrome/physical-device testing.
    await dotenv.load(fileName: kReleaseMode ? '.env.prod' : '.env.dev');

    // Initialize Token Service
    _tokenService = TokenService();

    // Initialize API Client
    final baseUrl = dotenv.env['API_BASE_URL'] ??
        (kReleaseMode
            ? (throw StateError(
                'FATAL: API_BASE_URL is missing from .env.prod in a release build. '
                'Refusing to silently fall back to a localhost URL in production.',
              ))
            : 'http://localhost:5000');
    _apiClient = ApiClient(
      baseUrl: baseUrl,
      tokenService: _tokenService,
    );
    _apiClient.initialize();

    // Initialize services - all share the same ApiClient/TokenService, so
    // the auth token attached in ApiClient's interceptor applies everywhere.
    _authService = AuthService(
      apiClient: _apiClient,
      tokenService: _tokenService,
    );
    _attendanceService = AttendanceService(apiClient: _apiClient);
    _attendanceOfflineQueue = AttendanceOfflineQueue(attendanceService: _attendanceService);
    _chatService = ChatService(apiClient: _apiClient);
    _chatSocketService = ChatWebSocketService(baseUrl: baseUrl, tokenService: _tokenService);
    _audioPlayerService = AudioPlayerService(apiClient: _apiClient);
    _salaryService = SalaryService(apiClient: _apiClient);
    _notificationService = NotificationService(apiClient: _apiClient);
    _profileService = ProfileService(apiClient: _apiClient);
    _pushNotificationService = PushNotificationService(
      attendanceService: _attendanceService,
      notificationService: _notificationService,
    );
    _realtimeService = RealtimeService(apiClient: _apiClient, attendanceService: _attendanceService);
    _connectivityWatcher = ConnectivityWatcher(
      notificationService: _notificationService,
      attendanceOfflineQueue: _attendanceOfflineQueue,
    );
    _connectivityWatcher.start();
    _legalAcceptanceService = LegalAcceptanceService(apiClient: _apiClient);
  }

  List<Override> providerOverrides() {
    return [
      authProvider.overrideWith((ref) {
        return AuthNotifier(_authService, chatSocketService: _chatSocketService);
      }),
    ];
  }
}
