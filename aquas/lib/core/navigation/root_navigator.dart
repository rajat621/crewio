// lib/core/navigation/root_navigator.dart
import 'package:flutter/material.dart';

/// Lets services without a BuildContext (PushNotificationService, in
/// particular) push named routes - used for deep-linking when a
/// notification is tapped from the foreground, background, or a cold
/// start. Assigned to MaterialApp.navigatorKey in main.dart.
final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();
