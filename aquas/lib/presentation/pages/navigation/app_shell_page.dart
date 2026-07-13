//lib/presentation/pages/navigation/app_shell_page.dart
import 'package:flutter/material.dart';
import '../../widgets/common/bottom_nav_bar.dart';
import '../calendar/calendar_page.dart';
import '../chat/chat_list_page.dart';
import '../home/home_page.dart';
import '../payment/payment_page.dart';

class AppShellPage extends StatefulWidget {
  const AppShellPage({super.key, this.initialTab = AppTab.home});

  final AppTab initialTab;

  @override
  State<AppShellPage> createState() => _AppShellPageState();
}

class _AppShellPageState extends State<AppShellPage> {
  late AppTab _currentTab;

  final List<Widget> _tabs = const [
    RepaintBoundary(child: HomePage()),
    RepaintBoundary(child: PaymentPage()),
    RepaintBoundary(child: CalendarPage()),
    RepaintBoundary(child: ChatListPage()),
  ];

  @override
  void initState() {
    super.initState();
    _currentTab = widget.initialTab;
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).padding.bottom;
    // The bottom nav bar is hidden while chatting so the conversation gets
    // the full screen height (matches standard messaging-app behavior).
    final showBottomNav = _currentTab != AppTab.chat;

    final reservedBottomSpace = showBottomNav
        ? AppBottomNavBar.cardHeight +
            AppBottomNavBar.contentGap +
            AppBottomNavBar.bottomMargin +
            bottomInset
        : 0.0;

    return Scaffold(
      backgroundColor: const Color(0xFFF3F0FF),
      extendBody: true,
      body: Stack(
        children: [
          Positioned.fill(
            child: Padding(
              padding: EdgeInsets.only(bottom: reservedBottomSpace),
              child: IndexedStack(
                index: _currentTab.index,
                children: [
                  _buildTabVisibility(0),
                  _buildTabVisibility(1),
                  _buildTabVisibility(2),
                  _buildTabVisibility(3),
                ],
              ),
            ),
          ),
          if (showBottomNav)
            Align(
              alignment: Alignment.bottomCenter,
              child: SafeArea(
                top: false,
                child: AppBottomNavBar(
                  currentTab: _currentTab,
                  onTabSelected: _onTabSelected,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildTabVisibility(int index) {
    return TickerMode(enabled: _currentTab.index == index, child: _tabs[index]);
  }

  void _onTabSelected(AppTab tab) {
    if (tab == _currentTab) {
      return;
    }

    setState(() {
      _currentTab = tab;
    });
  }
}