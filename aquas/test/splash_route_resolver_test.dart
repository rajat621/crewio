import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:aquas/presentation/pages/splash/splash_page.dart';

void main() {
  group('resolveNextRoute', () {
    test('falls back to login when auth check never completes', () async {
      final route = await resolveNextRoute(
        checkAuthStatus: () async {
          await Future<void>.delayed(const Duration(seconds: 1));
          return true;
        },
        timeout: const Duration(milliseconds: 50),
      );

      expect(route, '/login');
    });

    test('returns home when auth check resolves true', () async {
      final route = await resolveNextRoute(
        checkAuthStatus: () async => true,
        timeout: const Duration(milliseconds: 50),
      );

      expect(route, '/home');
    });
  });
}
