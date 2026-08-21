// lib/core/network/websocket_service.dart
//
// Dedicated Socket.IO connection for the employee <-> office chat feature.
//
// Kept separate from RealtimeService (core/services/realtime_service.dart,
// used for on-demand location requests) so neither feature's connection
// lifecycle can affect the other's - this mirrors that service's
// connect/reconnect handling closely, but adds one important structural
// guarantee: the raw socket only ever gets ONE 'chat:message' listener and
// ONE 'chat:read' listener attached, for the lifetime of the connection.
// Screens subscribe to the broadcast streams below instead of touching the
// socket directly, so re-entering the chat screen (tab switch, push/pop,
// hot restart of just that widget) can never result in two raw socket
// listeners double-delivering the same event - the classic cause of
// "message appears twice after leaving and coming back".
//
// Production lifecycle:
//  - connect() is idempotent and safe to call every time the chat screen
//    becomes visible.
//  - Auto-reconnects on network loss (socket_io_client's own
//    enableReconnection()); connectionStatus reports friendly, translated
//    states so the UI never has to show a raw socket exception string.
//  - dispose() tears the whole thing down - only ServiceLocator should
//    call this (e.g. on logout), not individual screens.
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as socket_io;
import '../services/token_service.dart';

enum ChatConnectionStatus { disconnected, connecting, connected, reconnecting }

class ChatWebSocketService {
  final String baseUrl;
  final TokenService tokenService;

  socket_io.Socket? _socket;
  bool _intentionalDisconnect = false;

  final ValueNotifier<ChatConnectionStatus> connectionStatus =
      ValueNotifier(ChatConnectionStatus.disconnected);

  final _messageController = StreamController<Map<String, dynamic>>.broadcast();
  final _readController = StreamController<Map<String, dynamic>>.broadcast();

  /// New incoming/outgoing chat messages for this device's thread.
  Stream<Map<String, dynamic>> get messages => _messageController.stream;

  /// `chat:read` receipts (existing read-status feature - untouched).
  Stream<Map<String, dynamic>> get readReceipts => _readController.stream;

  ChatWebSocketService({required this.baseUrl, required this.tokenService});

  bool get isConnected => _socket?.connected ?? false;

  void _report(String message) {
    if (kDebugMode) debugPrint('[chat-socket] $message');
  }

  Future<void> connect() async {
    if (_socket != null && _socket!.connected) return;

    final token = await tokenService.getAccessToken();
    if (token == null || token.isEmpty) {
      _report('no access token yet - not connecting');
      return;
    }

    _intentionalDisconnect = false;
    connectionStatus.value = ChatConnectionStatus.connecting;

    // Dispose of any previous socket before creating a new one so we never
    // end up with two live connections (and therefore two sets of
    // listeners) at once.
    _teardownSocket();

    _socket = socket_io.io(
      baseUrl,
      socket_io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .setAuth({'token': token})
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(10000)
          .build(),
    );

    _socket!.onConnect((_) {
      _report('connected (id: ${_socket!.id})');
      connectionStatus.value = ChatConnectionStatus.connected;
    });

    _socket!.onDisconnect((_) {
      _report('disconnected');
      if (!_intentionalDisconnect) {
        connectionStatus.value = ChatConnectionStatus.reconnecting;
      } else {
        connectionStatus.value = ChatConnectionStatus.disconnected;
      }
    });

    _socket!.onReconnectAttempt((_) => connectionStatus.value = ChatConnectionStatus.reconnecting);
    _socket!.onReconnect((_) => connectionStatus.value = ChatConnectionStatus.connected);

    // Logged for diagnostics only - the UI never sees this raw string,
    // just the translated ChatConnectionStatus above.
    _socket!.onConnectError((err) => _report('connect error: $err'));
    _socket!.onError((err) => _report('socket error: $err'));

    // Attached exactly once per socket instance - this is the one and only
    // place raw 'chat:message'/'chat:read' listeners are ever registered.
    _socket!.on('chat:message', (data) {
      if (data is Map) _messageController.add(Map<String, dynamic>.from(data));
    });
    _socket!.on('chat:read', (data) {
      if (data is Map) _readController.add(Map<String, dynamic>.from(data));
    });
  }

  void _teardownSocket() {
    _socket?.off('chat:message');
    _socket?.off('chat:read');
    _socket?.dispose();
    _socket = null;
  }

  /// Call when the token changes (e.g. after refresh) and a fresh handshake
  /// is required. No-ops if already disconnected.
  Future<void> reconnectWithFreshToken() async {
    _teardownSocket();
    await connect();
  }

  void disconnect() {
    _intentionalDisconnect = true;
    _teardownSocket();
    connectionStatus.value = ChatConnectionStatus.disconnected;
  }

  void dispose() {
    disconnect();
    _messageController.close();
    _readController.close();
  }
}