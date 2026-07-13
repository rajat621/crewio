import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:socket_io_client/socket_io_client.dart' as socket_io;
import 'attendance_service.dart';
import '../network/api_client.dart';

/// Keeps a live Socket.IO connection open so the dashboard's "Track
/// Employee" screen can ask this device for its current location right now
/// - this is what makes selecting an employee on the dashboard work even
/// when they aren't checked in/working (see socket.service.js
/// `location:request` -> `location:requested` on the backend).
class RealtimeService {
  final ApiClient apiClient;
  final AttendanceService attendanceService;

  /// Optional hook so the UI can surface what's happening (e.g. via a
  /// SnackBar) without digging through terminal logs - every meaningful
  /// step of the connect/request/respond flow reports through here.
  void Function(String message)? onStatus;

  socket_io.Socket? _socket;

  RealtimeService({required this.apiClient, required this.attendanceService});

  void _report(String message) {
    debugPrint('[realtime] $message');
    onStatus?.call(message);
  }

  Future<void> connect() async {
    // Already connected - nothing to do.
    if (_socket != null && _socket!.connected) return;

    final token = await apiClient.tokenService.getAccessToken();
    if (token == null || token.isEmpty) {
      _report('no access token yet - not connecting');
      return;
    }

    _report('connecting to ${apiClient.baseUrl} ...');
    _socket?.dispose();
    _socket = socket_io.io(
      apiClient.baseUrl,
      socket_io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .enableReconnection()
          .build(),
    );

    _socket!.onConnect((_) => _report('connected to server (live)'));
    _socket!.onConnectError((err) => _report('connection failed: $err'));
    _socket!.onError((err) => _report('socket error: $err'));
    _socket!.onDisconnect((_) => _report('disconnected from server'));
    _socket!.on('location:requested', (_) {
      _report('dashboard requested your location - fetching...');
      _handleOnDemandLocationRequest();
    });
  }

  Future<void> _handleOnDemandLocationRequest() async {
    try {
      final permission = await _ensureLocationPermission();
      if (!permission) {
        _report('location permission not granted - cannot respond');
        return;
      }

      if (!await Geolocator.isLocationServiceEnabled()) {
        _report('device location (GPS) is turned off - cannot respond');
        return;
      }

      final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.best);
      _report('got position, sending to dashboard...');
      await attendanceService.pingLocation(
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy: pos.accuracy,
        event: 'on_demand',
      );
      _report('location sent to dashboard successfully');
    } catch (e) {
      _report('failed to get/send location: $e');
    }
  }

  Future<bool> _ensureLocationPermission() async {
    var status = await Permission.locationWhenInUse.status;
    if (status.isGranted) return true;
    status = await Permission.locationWhenInUse.request();
    return status.isGranted;
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
