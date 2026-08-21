// lib/presentation/pages/notification/notification_page.dart

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../config/theme/app_colors.dart';
import '../../../config/theme/app_text_styles.dart';
import '../../../service_locator.dart';
import '../../../data/models/mobile_models.dart';
import '../../../core/notifications/notification_router.dart';
import '../../widgets/common/app_feedback_dialog.dart';
import '../../../core/errors/error_message_mapper.dart';

class NotificationPage extends StatefulWidget {
  const NotificationPage({super.key});

  @override
  State<NotificationPage> createState() => _NotificationPageState();
}

class _NotificationPageState extends State<NotificationPage> {
  static const _pageSize = 20;

  final _notificationService = ServiceLocator().notificationService;
  final _scrollController = ScrollController();

  List<NotificationModel> _notifications = [];
  int _page = 1;
  bool _hasMore = true;
  bool _isLoading = true;
  bool _isLoadingMore = false;
  bool _isMarkingAllRead = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_hasMore || _isLoadingMore || _isLoading) return;
    // Start loading the next page a bit before the user hits the very
    // bottom, so the list keeps feeling continuous.
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      _loadMore();
    }
  }

  Future<void> _load() async {
    setState(() => _isLoading = true);
    try {
      final result = await _notificationService.getNotifications(page: 1, limit: _pageSize);
      unawaited(_notificationService.refreshUnreadCount());
      if (!mounted) return;
      setState(() {
        _notifications = result.items;
        _page = 1;
        _hasMore = result.hasMore;
        _isLoading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error = ErrorMessageMapper.toUserMessage(e);
      });
    }
  }

  Future<void> _loadMore() async {
    setState(() => _isLoadingMore = true);
    try {
      final nextPage = _page + 1;
      final result = await _notificationService.getNotifications(page: nextPage, limit: _pageSize);
      if (!mounted) return;
      setState(() {
        _notifications = [..._notifications, ...result.items];
        _page = nextPage;
        _hasMore = result.hasMore;
        _isLoadingMore = false;
      });
    } catch (_) {
      // Non-critical - the user can keep scrolling to retry, or pull to refresh.
      if (!mounted) return;
      setState(() => _isLoadingMore = false);
    }
  }

  Future<void> _markRead(NotificationModel n) async {
    if (!n.read) {
      try {
        await _notificationService.markRead(n.id);
        if (mounted) {
          setState(() {
            _notifications = _notifications
                .map((m) => m.id == n.id ? m.copyWith(read: true) : m)
                .toList();
          });
        }
      } catch (_) {
        // Non-critical - leave it unread rather than interrupt the user.
      }
    }

    final route = NotificationRouter.routeFor(n.payload);
    // Don't push a second copy of the screen we're already standing on -
    // this happens for any notification without a recognized `type`
    // (older notifications created before `type` was added, for example),
    // since NotificationRouter's fallback destination for those IS this
    // same Notification Center.
    final isCurrentRoute = ModalRoute.of(context)?.settings.name == route;
    if (route != null && mounted && !isCurrentRoute) {
      Navigator.of(context).pushNamed(route);
    }
  }

  Future<void> _markAllRead() async {
    if (_isMarkingAllRead || _notifications.every((n) => n.read)) return;
    setState(() => _isMarkingAllRead = true);
    try {
      await _notificationService.markAllRead();
      if (!mounted) return;
      setState(() {
        _notifications = _notifications.map((n) => n.copyWith(read: true)).toList();
      });
    } catch (_) {
      if (mounted) {
        AppFeedbackDialog.showError(context, message: 'Could not mark all as read. Try again.');
      }
    } finally {
      if (mounted) setState(() => _isMarkingAllRead = false);
    }
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min';
    if (diff.inHours < 24) return '${diff.inHours} hr';
    return '${diff.inDays} d';
  }

  @override
  Widget build(BuildContext context) {
    final hasUnread = _notifications.any((n) => !n.read);
    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      appBar: AppBar(
        backgroundColor: AppColors.bgWhite,
        elevation: 0,
        title: const Text('Notification'),
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(LucideIcons.chevronLeft),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          TextButton(
            onPressed: (!hasUnread || _isMarkingAllRead) ? null : _markAllRead,
            child: _isMarkingAllRead
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Mark all read'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          Center(child: Text(_error!, textAlign: TextAlign.center)),
        ],
      );
    }
    if (_notifications.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 80),
          Center(child: Text('No notifications yet', style: TextStyle(color: Colors.grey))),
        ],
      );
    }
    return ListView.separated(
      controller: _scrollController,
      padding: const EdgeInsets.all(16),
      itemCount: _notifications.length + (_hasMore ? 1 : 0),
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        if (index >= _notifications.length) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          );
        }
        final n = _notifications[index];
        return GestureDetector(
          onTap: () => _markRead(n),
          child: _buildNotificationItem(
            icon: n.read ? LucideIcons.bell : LucideIcons.bellRing,
            iconColor: n.read ? AppColors.textGray : AppColors.primaryBlue,
            title: n.title,
            description: n.body,
            timeAgo: _timeAgo(n.createdAt),
            unread: !n.read,
          ),
        );
      },
    );
  }

  Widget _buildNotificationItem({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String description,
    required String timeAgo,
    required bool unread,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.bgWhite,
        borderRadius: BorderRadius.circular(12),
        border: unread ? Border.all(color: AppColors.primaryBlue.withAlpha((0.25 * 255).round())) : null,
      ),
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Container(
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              color: iconColor.withAlpha((0.15 * 255).round()),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: iconColor),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppTextStyles.titleSmall),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: AppTextStyles.bodySmall.copyWith(color: AppColors.textGray),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(timeAgo, style: AppTextStyles.labelSmall),
              if (unread) ...[
                const SizedBox(height: 6),
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: AppColors.primaryBlue,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}