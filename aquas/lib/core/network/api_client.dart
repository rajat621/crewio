import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';
import '../services/token_service.dart';

class ApiClient {
  final String baseUrl;
  final TokenService tokenService;
  late Dio _dio;
  bool _isRefreshing = false;

  /// SHA-256 fingerprint(s) of your backend's TLS certificate (SPKI pin),
  /// hex-encoded, lowercase, no colons. Leave empty to skip pinning (fine
  /// for local dev against a self-signed/staging cert). For production,
  /// generate with:
  ///   openssl s_client -connect your-api-host:443 </dev/null 2>/dev/null \
  ///     | openssl x509 -pubkey -noout \
  ///     | openssl pkey -pubin -outform der \
  ///     | openssl dgst -sha256
  /// Pin BOTH your current cert and your renewal/backup cert, or a
  /// certificate rotation will lock every installed app out until it's updated.
  static const List<String> pinnedCertSha256 = [
    // 'aa11bb22...',
  ];

  ApiClient({
    required this.baseUrl,
    required this.tokenService,
  });

  void initialize() {
    _dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
        headers: {
          'Content-Type': 'application/json',
        },
      ),
    );

    if (pinnedCertSha256.isNotEmpty) {
      _applyCertificatePinning();
    }

    // Debug-mode request/response logging, with secrets redacted. The
    // previous version logged the raw Authorization header and login
    // password in plaintext to the device log on every request.
    if (kDebugMode) {
      _dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            debugPrint('--> ${options.method} ${options.uri}');
            debugPrint('headers: ${_redactHeaders(options.headers)}');
            if (options.data != null) {
              debugPrint('body: ${_redactBody(options.data)}');
            }
            return handler.next(options);
          },
          onResponse: (response, handler) {
            debugPrint('<-- ${response.statusCode} ${response.requestOptions.uri}');
            return handler.next(response);
          },
          onError: (error, handler) {
            debugPrint('<-- ERROR ${error.response?.statusCode} ${error.requestOptions.uri}: ${error.message}');
            return handler.next(error);
          },
        ),
      );
    }

    // JWT token interceptor + one-shot refresh-and-retry on 401.
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await tokenService.getToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (error, handler) async {
          final isAuthRoute = error.requestOptions.path.contains('/auth/login') ||
              error.requestOptions.path.contains('/auth/refresh');

          if (error.response?.statusCode == 401 && !isAuthRoute && !_isRefreshing) {
            _isRefreshing = true;
            try {
              final refreshed = await _tryRefreshToken();
              if (refreshed != null) {
                final retryOptions = error.requestOptions;
                retryOptions.headers['Authorization'] = 'Bearer $refreshed';
                final response = await _dio.fetch(retryOptions);
                _isRefreshing = false;
                return handler.resolve(response);
              }
            } catch (_) {
              // fall through to clearing tokens below
            }
            _isRefreshing = false;
            await tokenService.clearAll();
          } else if (error.response?.statusCode == 401) {
            await tokenService.clearAll();
          }

          return handler.next(error);
        },
      ),
    );
  }

  Future<String?> _tryRefreshToken() async {
    final refresh = await tokenService.getRefreshToken();
    if (refresh == null || refresh.isEmpty) return null;

    // Bare Dio call (not through this same client) to avoid recursively
    // triggering this same interceptor.
    final plainDio = Dio(BaseOptions(baseUrl: baseUrl));
    final response = await plainDio.post('/api/mobile/auth/refresh', data: {'refreshToken': refresh});
    if (response.statusCode != 200) return null;

    final newAccess = response.data['accessToken'] as String?;
    final newRefresh = response.data['refreshToken'] as String?;
    if (newAccess == null) return null;

    await tokenService.saveAccessToken(newAccess);
    if (newRefresh != null) await tokenService.saveRefreshToken(newRefresh);
    return newAccess;
  }

  void _applyCertificatePinning() {
    (_dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
      final client = HttpClient();
      client.badCertificateCallback = (X509Certificate cert, String host, int port) {
        // Only ever accept a cert whose SHA-256 fingerprint is in our pin
        // list - this is checked in ADDITION to normal TLS chain validation
        // that already happened before this callback fires for a
        // self-signed/untrusted cert. For a CA-signed cert this callback
        // isn't invoked at all unless the fingerprint check below is also
        // wired via a SecurityContext; treat this as defense-in-depth on
        // top of standard TLS, not a replacement for it.
        final sha256Hex = sha256OfCert(cert);
        return pinnedCertSha256.contains(sha256Hex);
      };
      return client;
    };
  }

  static String sha256OfCert(X509Certificate cert) {
    // Deliberately left as a hook - wire up package:crypto's sha256 over
    // cert.der here once you've generated your real pin(s) above, e.g.:
    //   import 'package:crypto/crypto.dart';
    //   return sha256.convert(cert.der).toString();
    return '';
  }

  Map<String, dynamic> _redactHeaders(Map<String, dynamic> headers) {
    final copy = Map<String, dynamic>.from(headers);
    if (copy.containsKey('Authorization')) copy['Authorization'] = '[redacted]';
    return copy;
  }

  dynamic _redactBody(dynamic data) {
    if (data is Map) {
      final copy = Map<String, dynamic>.from(data);
      for (final key in ['password', 'accessToken', 'refreshToken', 'token', 'appPassword']) {
        if (copy.containsKey(key)) copy[key] = '[redacted]';
      }
      return copy;
    }
    return data;
  }

  // GET request
  Future<Response> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) {
    return _dio.get(
      path,
      queryParameters: queryParameters,
      options: options,
    );
  }

  // POST request
  Future<Response> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) {
    return _dio.post(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
    );
  }

  // PUT request
  Future<Response> put(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) {
    return _dio.put(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
    );
  }

  // PATCH request
  Future<Response> patch(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) {
    return _dio.patch(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
    );
  }

  // DELETE request
  Future<Response> delete(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) {
    return _dio.delete(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
    );
  }
}
