import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';
import '../../service_locator.dart';

/// Despite the name (kept for now to avoid a larger rename across the
/// codebase), this does NOT do OS-level background location tracking -
/// it's a foreground polling timer that pings the current position every
/// [interval] while the Home screen is open, using only the
/// foreground/while-in-use location permission the app actually holds.
/// It stops itself when the app is minimized/backgrounded and resumes when
/// the app returns to the foreground, so it never polls GPS while the user
/// can't see the app - both to respect the permission scope this app
/// actually has (no ACCESS_BACKGROUND_LOCATION is declared) and to avoid
/// draining battery for updates nobody's using (spec section 7 & 13).
class BackgroundLocationService with WidgetsBindingObserver {
  static final BackgroundLocationService _instance = BackgroundLocationService._internal();
  factory BackgroundLocationService() => _instance;
  BackgroundLocationService._internal();

  Timer? _timer;
  bool _running = false;
  Duration _interval = const Duration(minutes: 10);
  bool _observerRegistered = false;

  void start({Duration interval = const Duration(minutes: 10)}) {
    _interval = interval;
    if (!_observerRegistered) {
      WidgetsBinding.instance.addObserver(this);
      _observerRegistered = true;
    }
    _startTimer();
  }

  void stop() {
    _stopTimer();
    if (_observerRegistered) {
      WidgetsBinding.instance.removeObserver(this);
      _observerRegistered = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Only poll while the app is actually visible/in-use - matches the
    // foreground-only permission this app holds and avoids pointless GPS
    // requests (and battery drain) while the user isn't looking at it.
    if (state == AppLifecycleState.resumed) {
      _startTimer();
    } else {
      _stopTimer();
    }
  }

  void _startTimer() {
    if (_running) return;
    _running = true;
    _tick();
    _timer = Timer.periodic(_interval, (_) => _tick());
  }

  void _stopTimer() {
    _timer?.cancel();
    _timer = null;
    _running = false;
  }

  Future<void> _tick() async {
    try {
      final has = await Geolocator.isLocationServiceEnabled();
      if (!has) return;
      final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.best);
      final attendanceService = ServiceLocator().attendanceService;
      await attendanceService.pingLocation(lat: pos.latitude, lng: pos.longitude, accuracy: pos.accuracy, event: 'background_ping');
    } catch (e) {
      // best-effort
    }
  }
}
