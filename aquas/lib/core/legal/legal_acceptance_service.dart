// lib/core/legal/legal_acceptance_service.dart
//
// Handles section 1 & 4 of the legal-compliance spec:
//   - records a permanent, backend-synced audit trail of legal acceptance
//     (acceptedAt, acceptedVersion, appVersion, devicePlatform,
//     deviceModel, userAgent - acceptedIp is stamped server-side from the
//     request, since a client-reported IP isn't trustworthy for audit use)
//   - detects when the backend has published a newer legal version and
//     forces re-acceptance before the app can be used
//
// Local-first: acceptance is always written to secure storage immediately
// (so login can never be blocked by a slow/offline backend sync), and the
// backend sync is attempted in the background with the queued request
// retried on next app start if it fails. This mirrors the offline-queue
// pattern already used for attendance in AttendanceOfflineQueue.

import 'dart:convert';
import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../network/api_client.dart';
import 'legal_documents.dart';

class LegalAcceptanceRecord {
  final String acceptedVersion;
  final DateTime acceptedAt;
  final String appVersion;
  final String devicePlatform;
  final String deviceModel;
  final String userAgent;
  final List<String> acceptedDocumentKeys;

  const LegalAcceptanceRecord({
    required this.acceptedVersion,
    required this.acceptedAt,
    required this.appVersion,
    required this.devicePlatform,
    required this.deviceModel,
    required this.userAgent,
    required this.acceptedDocumentKeys,
  });

  Map<String, dynamic> toJson() => {
        'acceptedVersion': acceptedVersion,
        'acceptedAt': acceptedAt.toIso8601String(),
        'appVersion': appVersion,
        'devicePlatform': devicePlatform,
        'deviceModel': deviceModel,
        'userAgent': userAgent,
        'acceptedDocumentKeys': acceptedDocumentKeys,
        // acceptedIp is intentionally NOT set here - the backend should
        // stamp it from the request's source IP so it can't be spoofed by
        // the client, then persist it alongside this payload.
      };

  factory LegalAcceptanceRecord.fromJson(Map<String, dynamic> json) {
    return LegalAcceptanceRecord(
      acceptedVersion: json['acceptedVersion'] as String,
      acceptedAt: DateTime.parse(json['acceptedAt'] as String),
      appVersion: json['appVersion'] as String,
      devicePlatform: json['devicePlatform'] as String,
      deviceModel: json['deviceModel'] as String,
      userAgent: json['userAgent'] as String,
      acceptedDocumentKeys:
          List<String>.from(json['acceptedDocumentKeys'] as List? ?? const []),
    );
  }
}

class LegalAcceptanceService {
  static const _recordKey = 'legal_acceptance_record_v1';
  static const _pendingSyncKey = 'legal_acceptance_pending_sync_v1';

  final FlutterSecureStorage _storage;
  final ApiClient _apiClient;

  LegalAcceptanceService({
    required ApiClient apiClient,
    FlutterSecureStorage? storage,
  })  : _apiClient = apiClient,
        _storage = storage ?? const FlutterSecureStorage();

  /// The locally stored record of the worker's most recent acceptance, or
  /// null if they've never accepted on this device.
  Future<LegalAcceptanceRecord?> getStoredAcceptance() async {
    final raw = await _storage.read(key: _recordKey);
    if (raw == null) return null;
    try {
      return LegalAcceptanceRecord.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
      );
    } catch (_) {
      return null;
    }
  }

  /// True if the worker has accepted the version currently required by the
  /// app bundle. Does NOT check the backend - call [fetchRequiredVersion]
  /// separately (typically right after login) to catch a version bump that
  /// happened without an app update.
  Future<bool> hasAcceptedCurrentBundledVersion() async {
    final stored = await getStoredAcceptance();
    if (stored == null) return false;
    return stored.acceptedVersion == LegalDocuments.currentAcceptanceVersion;
  }

  /// Asks the backend which legal version is currently required. Falls
  /// back to the version bundled in the app (LegalDocuments) if the
  /// endpoint is unreachable, so a network hiccup never hard-blocks login
  /// on top of whatever the last-known-good version was.
  Future<String> fetchRequiredVersion() async {
    try {
      final response = await _apiClient.get('/api/mobile/legal/version');
      final version = response.data is Map
          ? response.data['requiredVersion'] as String?
          : null;
      if (version != null && version.isNotEmpty) return version;
    } catch (_) {
      // offline / endpoint not deployed yet - fall through to bundled version
    }
    return LegalDocuments.currentAcceptanceVersion;
  }

  /// True if the worker needs to (re-)accept before continuing - either
  /// they've never accepted, or the backend now requires a newer version
  /// than what they last accepted.
  Future<bool> needsAcceptance() async {
    final stored = await getStoredAcceptance();
    if (stored == null) return true;
    final required = await fetchRequiredVersion();
    return stored.acceptedVersion != required;
  }

  Future<Map<String, String>> _collectDeviceMetadata() async {
    final packageInfo = await PackageInfo.fromPlatform();
    final deviceInfo = DeviceInfoPlugin();

    String platform = 'unknown';
    String model = 'unknown';

    try {
      if (kIsWeb) {
        final webInfo = await deviceInfo.webBrowserInfo;
        platform = 'web';
        model = webInfo.browserName.name;
      } else if (Platform.isAndroid) {
        final androidInfo = await deviceInfo.androidInfo;
        platform = 'android';
        model = '${androidInfo.manufacturer} ${androidInfo.model}';
      } else if (Platform.isIOS) {
        final iosInfo = await deviceInfo.iosInfo;
        platform = 'ios';
        model = iosInfo.utsname.machine;
      }
    } catch (_) {
      // device_info can throw on some emulators/simulators - non-fatal,
      // we still want the acceptance record to be written.
    }

    return {
      'appVersion': '${packageInfo.version}+${packageInfo.buildNumber}',
      'devicePlatform': platform,
      'deviceModel': model,
      'userAgent': 'CrewControl/${packageInfo.version} ($platform; $model)',
    };
  }

  /// Records acceptance of the given documents (defaults to ALL required
  /// documents) at the current bundled version. Writes locally first
  /// (so this can never fail the login flow), then attempts to sync to the
  /// backend audit log. If the sync fails, it's marked pending and retried
  /// via [retryPendingSyncIfAny] on next app start / next successful call.
  Future<void> recordAcceptance({
    List<String>? acceptedDocumentKeys,
  }) async {
    final metadata = await _collectDeviceMetadata();
    final record = LegalAcceptanceRecord(
      acceptedVersion: LegalDocuments.currentAcceptanceVersion,
      acceptedAt: DateTime.now().toUtc(),
      appVersion: metadata['appVersion']!,
      devicePlatform: metadata['devicePlatform']!,
      deviceModel: metadata['deviceModel']!,
      userAgent: metadata['userAgent']!,
      acceptedDocumentKeys:
          acceptedDocumentKeys ?? LegalDocuments.all.map((d) => d.key).toList(),
    );

    await _storage.write(
      key: _recordKey,
      value: jsonEncode(record.toJson()),
    );

    await _syncToBackend(record);
  }

  Future<void> _syncToBackend(LegalAcceptanceRecord record) async {
    try {
      await _apiClient.post(
        '/api/mobile/legal/accept',
        data: record.toJson(),
      );
      await _storage.delete(key: _pendingSyncKey);
    } catch (_) {
      // Backend audit log is important but must never block the worker
      // from using the app once they've genuinely accepted on-device.
      // Queue it for a retry (e.g. next login, or next time this service
      // is used) instead of losing it silently.
      await _storage.write(key: _pendingSyncKey, value: jsonEncode(record.toJson()));
    }
  }

  /// Call this opportunistically (e.g. after a successful login, or on app
  /// resume with connectivity) to flush any acceptance record that was
  /// written locally but never made it to the backend audit log.
  Future<void> retryPendingSyncIfAny() async {
    final raw = await _storage.read(key: _pendingSyncKey);
    if (raw == null) return;
    try {
      final record = LegalAcceptanceRecord.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      await _syncToBackend(record);
    } catch (_) {
      // malformed pending record - drop it rather than retry forever
      await _storage.delete(key: _pendingSyncKey);
    }
  }
}
