// lib/presentation/pages/chat/chat_list_page.dart
//
// There's only ever one conversation for an employee (with their office/
// owner), so there's no separate "conversation list" screen - this widget
// is kept only so app_shell_page.dart's existing IndexedStack tab wiring
// (and main.dart's '/chat' route) don't need to change. The actual screen
// now lives in chat_detail_page.dart (history load -> socket attach,
// voice notes, connection status).
import 'package:flutter/material.dart';
import 'chat_detail_page.dart';

class ChatListPage extends StatelessWidget {
  const ChatListPage({super.key});

  @override
  Widget build(BuildContext context) => const ChatDetailPage();
}
