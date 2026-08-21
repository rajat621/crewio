// lib/core/navigation/current_route_tracker.dart
import 'package:flutter/material.dart';

class CurrentRouteTracker extends NavigatorObserver {
  static String? currentRouteName;

  @override
  void didPush(Route route, Route? previousRoute) {
    currentRouteName = route.settings.name;
  }

  @override
  void didPop(Route route, Route? previousRoute) {
    currentRouteName = previousRoute?.settings.name;
  }

  @override
  void didReplace({Route? newRoute, Route? oldRoute}) {
    currentRouteName = newRoute?.settings.name;
  }
}
