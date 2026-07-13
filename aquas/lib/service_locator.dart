import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'core/network/api_client.dart';
import 'core/services/token_service.dart';
import 'core/services/auth_service.dart';
import 'core/services/attendance_service.dart';
import 'core/services/chat_service.dart';
import 'core/services/salary_service.dart';
import 'core/services/notification_service.dart';
import 'core/services/profile_service.dart';
import 'core/services/push_notification_service.dart';
import 'core/services/realtime_service.dart';
import 'presentation/providers/auth_provider.dart';

// Service Locator Configuration
class ServiceLocator {
  static final ServiceLocator _instance = ServiceLocator._internal();

  late TokenService _tokenService;
  late ApiClient _apiClient;
  late AuthService _authService;
  late AttendanceService _attendanceService;
  late ChatService _chatService;
  late SalaryService _salaryService;
  late NotificationService _notificationService;
  late ProfileService _profileService;
  late PushNotificationService _pushNotificationService;
  late RealtimeService _realtimeService;

  factory ServiceLocator() {
    return _instance;
  }

  ServiceLocator._internal();

  // Getters
  TokenService get tokenService => _tokenService;
  ApiClient get apiClient => _apiClient;
  AuthService get authService => _authService;
  AttendanceService get attendanceService => _attendanceService;
  ChatService get chatService => _chatService;
  SalaryService get salaryService => _salaryService;
  NotificationService get notificationService => _notificationService;
  ProfileService get profileService => _profileService;
  PushNotificationService get pushNotificationService => _pushNotificationService;
  RealtimeService get realtimeService => _realtimeService;

  Future<void> setup() async {
    // Load environment variables
    await dotenv.load(fileName: '.env.dev');

    // Initialize Token Service
    _tokenService = TokenService();

    // Initialize API Client
    final baseUrl = dotenv.env['API_BASE_URL'] ?? 'http://localhost:5000';
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
    _chatService = ChatService(apiClient: _apiClient);
    _salaryService = SalaryService(apiClient: _apiClient);
    _notificationService = NotificationService(apiClient: _apiClient);
    _profileService = ProfileService(apiClient: _apiClient);
    _pushNotificationService = PushNotificationService(attendanceService: _attendanceService);
    _realtimeService = RealtimeService(apiClient: _apiClient, attendanceService: _attendanceService);
  }

  List<Override> providerOverrides() {
    return [
      authProvider.overrideWith((ref) {
        return AuthNotifier(_authService);
      }),
    ];
  }
}
