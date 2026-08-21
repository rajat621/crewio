// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aquas/main.dart';

void main() {
  testWidgets('App launches successfully', (WidgetTester tester) async {
    // Closure-pass fix: AQASLaborApp is only ever run in production wrapped
    // in a ProviderScope (see main.dart's runApp) - every Riverpod
    // provider it reads assumes one exists in the widget tree above it.
    // Pumping it bare, as this test previously did, throws "Bad state: No
    // ProviderScope found" as soon as the router reaches the first page
    // that actually reads a provider (LoginPage). Not a production bug -
    // main.dart always provides this; the test just hadn't been kept in
    // sync with the app's actual DI setup.
    await tester.pumpWidget(
      const ProviderScope(child: AQASLaborApp()),
    );

    // Verify that the app widget is present
    expect(find.byType(AQASLaborApp), findsOneWidget);

    // Closure-pass fix: the real splash screen (splash_page.dart) holds a
    // deliberate, documented 2-second minimum display duration via
    // Future.delayed(_minSplashDuration) - which is itself backed by a
    // dart:async Timer. Without advancing past it, the test function
    // returns and the widget tree is disposed while that timer is still
    // pending, which flutter_test's AutomatedTestWidgetsFlutterBinding
    // treats as a leaked-resource failure ("A Timer is still pending even
    // after the widget tree was disposed"). This is a test-only gap, not a
    // production bug - the splash minimum-duration behavior is intentional
    // - so the fix is here, advancing virtual time past it, not touching
    // splash_page.dart. Deliberately a plain pump() for exactly the known
    // splash duration rather than pumpAndSettle(), which would additionally
    // wait on the splash's real auth-check network/secure-storage calls -
    // neither is mocked in this smoke test and could hang indefinitely
    // against no real backend.
    await tester.pump(const Duration(seconds: 2));

    // Closure-pass status (not fixed further): past this point the real
    // router reaches LoginPage, which reads authProvider - defined in
    // auth_provider.dart as a deliberate stub that throws
    // UnimplementedError unless overridden by
    // ServiceLocator().providerOverrides() (see main.dart's real runApp).
    // A correct fix needs a fake AuthNotifier/AuthService test double
    // wired the same way the real ServiceLocator wires the real one -
    // legitimate test-infrastructure work, not a one-line addition, and
    // risks a false-confidence "passing" test if the fake is built wrong.
    // Left failing rather than papered over; this test now fails at that
    // one real remaining gap instead of the two earlier ones (pending
    // splash timer, missing ProviderScope) that were fixed above.
  });
}
