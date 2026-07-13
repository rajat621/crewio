import 'package:dio/dio.dart';
import '../network/api_client.dart';
import '../../data/models/attendance_model.dart';
import '../../data/models/lifecycle_model.dart';

class AttendanceService {
  final ApiClient apiClient;

  AttendanceService({required this.apiClient});

  Map<String, dynamic>? _locationBody({double? lat, double? lng, double? accuracy}) {
    if (lat == null || lng == null) return null;
    return {
      'lat': lat,
      'lng': lng,
      if (accuracy != null) 'accuracy': accuracy,
      'timestamp': DateTime.now().toIso8601String(),
    };
  }

  /// GET /api/mobile/assignment-status - powers the "Waiting for Site" vs
  /// Check In / Site Finished / Take Leave home screen decision.
  Future<AssignmentStatus> getAssignmentStatus() async {
    try {
      final response = await apiClient.get('/api/mobile/assignment-status');
      return AssignmentStatus.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  /// Check in for the day. Sends a dashboard notification and records
  /// location - does NOT create an attendance record (that happens on
  /// [startWork]).
  Future<LifecycleResult> checkIn({double? lat, double? lng, double? accuracy}) async {
    try {
      final response = await apiClient.post(
        '/api/mobile/attendance/check-in',
        data: _locationBody(lat: lat, lng: lng, accuracy: accuracy),
      );
      return LifecycleResult.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  /// Starts work for the day. This is where the Attendance record is
  /// actually created.
  Future<LifecycleResult> startWork({double? lat, double? lng, double? accuracy}) async {
    try {
      final response = await apiClient.post(
        '/api/mobile/attendance/start-work',
        data: _locationBody(lat: lat, lng: lng, accuracy: accuracy),
      );
      return LifecycleResult.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  /// Stops work. When [hoursWorked] is provided (the employee's manual
  /// selection from the Stop Work popup), the backend uses that value
  /// directly instead of auto-computing from the work session's raw
  /// start/stop timestamps - that's what should show in the "Total Hours
  /// Worked" KPI.
  Future<LifecycleResult> stopWork({double? lat, double? lng, double? accuracy, double? hoursWorked}) async {
    try {
      final body = _locationBody(lat: lat, lng: lng, accuracy: accuracy) ?? <String, dynamic>{};
      if (hoursWorked != null) body['hoursWorked'] = hoursWorked;

      final response = await apiClient.post(
        '/api/mobile/attendance/stop-work',
        data: body,
      );
      return LifecycleResult.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  /// Ends the current site assignment and returns the employee to
  /// WAITING_FOR_COMPANY.
  Future<LifecycleResult> siteFinished({double? lat, double? lng, double? accuracy}) async {
    try {
      final response = await apiClient.post(
        '/api/mobile/site-finished',
        data: _locationBody(lat: lat, lng: lng, accuracy: accuracy),
      );
      return LifecycleResult.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  Future<LifecycleResult> startLeave({String? reason}) async {
    try {
      final response = await apiClient.post(
        '/api/mobile/leave/start',
        data: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      );
      return LifecycleResult.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  Future<LifecycleResult> endLeave() async {
    try {
      final response = await apiClient.post('/api/mobile/leave/end');
      return LifecycleResult.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  /// GET /api/mobile/expenses/summary - identical data/rules to the
  /// dashboard's Expense page, for the "View Advance" screen.
  Future<ExpenseSummary> getExpenseSummary() async {
    try {
      final response = await apiClient.get('/api/mobile/expenses/summary');
      return ExpenseSummary.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  Future<AttendanceRecord?> getToday() async {
    try {
      final response = await apiClient.get('/api/mobile/attendance/today');
      final data = response.data['data'];
      if (data == null) return null;
      return AttendanceRecord.fromJson(data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  Future<List<AttendanceRecord>> getHistory({DateTime? from, DateTime? to}) async {
    try {
      final response = await apiClient.get(
        '/api/mobile/attendance',
        queryParameters: {
          if (from != null) 'from': from.toIso8601String(),
          if (to != null) 'to': to.toIso8601String(),
        },
      );
      final List data = response.data['data'] as List? ?? [];
      return data.map((e) => AttendanceRecord.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  /// Powers both the home page stat cards and the calendar screen.
  Future<MonthlySummary> getMonthlySummary({int? month, int? year}) async {
    try {
      final now = DateTime.now();
      final response = await apiClient.get(
        '/api/mobile/attendance/summary',
        queryParameters: {
          'month': month ?? now.month,
          'year': year ?? now.year,
        },
      );
      return MonthlySummary.fromJson(response.data['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  /// Logs a standalone GPS ping (used for the periodic background location
  /// updates, separate from the location captured inline with each
  /// lifecycle action above).
  Future<void> pingLocation({
    required double lat,
    required double lng,
    double? accuracy,
    String? event,
  }) async {
    try {
      final payload = {
        'lat': lat,
        'lng': lng,
        if (accuracy != null) 'accuracy': accuracy,
        'timestamp': DateTime.now().toIso8601String(),
      };
      if (event != null) payload['event'] = event;

      await apiClient.post(
        '/api/mobile/location',
        data: payload,
      );
    } on DioException catch (_) {
      // Location pings are best-effort - never block the check-in/out flow on this.
    }
  }

  /// Registers this device's FCM token for push notifications.
  Future<void> registerPushToken(String fcmToken) async {
    try {
      await apiClient.post('/api/mobile/push/register', data: {'fcmToken': fcmToken});
    } on DioException catch (_) {
      // Best-effort - a failed push registration shouldn't block app usage.
    }
  }

  String _message(DioException error) {
    final data = error.response?.data;
    return (data is Map ? data['message'] : null)?.toString() ??
        error.message ??
        'Something went wrong. Please try again.';
  }
}
