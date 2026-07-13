import 'dart:async';
import 'package:geolocator/geolocator.dart';
import '../../service_locator.dart';

class BackgroundLocationService {
  static final BackgroundLocationService _instance = BackgroundLocationService._internal();
  factory BackgroundLocationService() => _instance;
  BackgroundLocationService._internal();

  Timer? _timer;
  bool _running = false;

  void start({Duration interval = const Duration(minutes: 10)}) {
    if (_running) return;
    _running = true;
    // Immediately run once, then periodically
    _tick();
    _timer = Timer.periodic(interval, (_) => _tick());
  }

  void stop() {
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
