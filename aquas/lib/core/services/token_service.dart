import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenService {
  static const String _accessTokenKey = 'access_token';
  static const String _refreshTokenKey = 'refresh_token';
  static const String _userIdKey = 'user_id';

  // See the matching comment in api_client.dart's request interceptor:
  // flutter_secure_storage reads/writes go through the Android Keystore,
  // which on some devices can genuinely hang (not throw) rather than
  // complete or fail - most commonly reported on Samsung devices, often
  // after a Keystore-encrypted value is invalidated by a reinstall or a
  // screen-lock/biometric change. Every storage call here is wrapped so a
  // stuck Keystore degrades to "treat it as if there's no token" instead
  // of hanging the caller (e.g. the login flow) forever.
  static const _storageTimeout = Duration(seconds: 5);

  final FlutterSecureStorage _storage;

  TokenService({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  Future<void> _writeGuarded(String key, String value) async {
    try {
      await _storage.write(key: key, value: value).timeout(_storageTimeout);
    } catch (_) {
      // Best-effort: if this device's secure storage is stuck/broken, the
      // caller (e.g. login) should still be able to complete - the user
      // will just need to log in again next app launch instead of staying
      // signed in, which is a far better failure mode than hanging forever.
    }
  }

  Future<String?> _readGuarded(String key) async {
    try {
      return await _storage.read(key: key).timeout(_storageTimeout);
    } catch (_) {
      return null;
    }
  }

  // Save access token
  Future<void> saveAccessToken(String token) => _writeGuarded(_accessTokenKey, token);

  // Get access token
  Future<String?> getAccessToken() => _readGuarded(_accessTokenKey);

  // Save refresh token
  Future<void> saveRefreshToken(String token) => _writeGuarded(_refreshTokenKey, token);

  // Get refresh token
  Future<String?> getRefreshToken() => _readGuarded(_refreshTokenKey);

  // Get token (alias for getAccessToken)
  Future<String?> getToken() async {
    return await getAccessToken();
  }

  // Save user ID
  Future<void> saveUserId(String userId) => _writeGuarded(_userIdKey, userId);

  // Get user ID
  Future<String?> getUserId() => _readGuarded(_userIdKey);

  // Delete all tokens and user data
  Future<void> clearAll() async {
    try {
      await Future.wait([
        _storage.delete(key: _accessTokenKey),
        _storage.delete(key: _refreshTokenKey),
        _storage.delete(key: _userIdKey),
      ]).timeout(_storageTimeout);
    } catch (_) {
      // Same reasoning as above - logout should never hang the UI even if
      // the underlying storage is stuck.
    }
  }

  // Check if token exists
  Future<bool> hasToken() async {
    final token = await getAccessToken();
    return token != null && token.isNotEmpty;
  }
}