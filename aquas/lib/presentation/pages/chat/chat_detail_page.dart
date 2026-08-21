// lib/presentation/pages/chat/chat_detail_page.dart
//
// The employee's chat screen: a single thread with their office/owner.
// Text + voice notes, realtime via ChatWebSocketService, with history
// loaded from MongoDB BEFORE the socket listener is attached (avoiding the
// classic race where a socket message arrives mid-fetch and then gets
// rendered a second time when the REST response lands) and every message -
// whatever its origin (REST response, socket push, this device's own
// just-sent message) - merged through a single id-keyed choke point so it
// can only ever appear once, no matter how many times leaving/returning to
// this screen re-triggers a load.
import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../config/theme/app_colors.dart';
import '../../../service_locator.dart';
import '../../../core/network/websocket_service.dart';
import '../../../core/services/voice_recorder_service.dart';
import '../../../data/models/chat/message_model.dart';
import '../../widgets/common/app_feedback_dialog.dart';
import '../../../core/errors/error_message_mapper.dart';

class ChatDetailPage extends StatefulWidget {
  const ChatDetailPage({super.key});

  @override
  State<ChatDetailPage> createState() => _ChatDetailPageState();
}

class _ChatDetailPageState extends State<ChatDetailPage> with WidgetsBindingObserver {
  final _chatService = ServiceLocator().chatService;
  final _socketService = ServiceLocator().chatSocketService;
  final _audioPlayer = ServiceLocator().audioPlayerService;
  final _tokenService = ServiceLocator().tokenService;
  final _recorder = VoiceRecorderService();
  final _textController = TextEditingController();
  final _scrollController = ScrollController();

  // The single source of truth for what's on screen, plus an id index used
  // as the dedupe choke point every message (REST, socket, local send) has
  // to pass through - see _mergeMessage().
  final List<ChatMessageModel> _messages = [];
  final Set<String> _messageIds = {};

  String? _myId;
  bool _isLoading = true;
  bool _isSending = false;
  String? _loadError;
  bool _isRecording = false;
  Duration _recordingElapsed = Duration.zero;
  Timer? _recordingTicker;

  StreamSubscription<Map<String, dynamic>>? _messageSub;
  StreamSubscription<Map<String, dynamic>>? _readSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _init();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Coming back to the foreground after the OS may have killed the
    // socket in the background - connect() is idempotent, so this is safe
    // to call unconditionally, and it's what actually recovers the
    // connection instead of leaving the user silently offline.
    if (state == AppLifecycleState.resumed) {
      _socketService.connect();
    }
  }

  Future<void> _init() async {
    _myId = await _tokenService.getUserId();
    // 1) Load history from MongoDB first...
    await _loadMessages();
    if (!mounted) return;
    // 2) ...THEN attach the socket listener.
    await _socketService.connect();
    _messageSub = _socketService.messages.listen(_handleIncomingSocketMessage);
    _readSub = _socketService.readReceipts.listen((_) {});
  }

  Future<void> _loadMessages() async {
    if (mounted) setState(() => _isLoading = true);
    try {
      final messages = await _chatService.getThread(_myId ?? '');
      if (!mounted) return;
      setState(() {
        _messages.clear();
        _messageIds.clear();
        for (final m in messages) {
          if (m.id.isNotEmpty && _messageIds.add(m.id)) _messages.add(m);
        }
        _isLoading = false;
        _loadError = null;
      });
      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _loadError = ErrorMessageMapper.toUserMessage(e);
      });
    }
  }

  void _handleIncomingSocketMessage(Map<String, dynamic> payload) {
    if (_myId == null) return;
    final message = ChatMessageModel.fromJson(payload, _myId!);
    // Defensive same-thread check - the backend already scopes delivery to
    // the right rooms (see socket.service.js), this just guards against
    // ever rendering something that isn't part of this employee's thread.
    if (message.from != _myId && message.to != _myId) return;
    _mergeMessage(message);
  }

  /// The single choke point every message goes through, keyed by id. A
  /// message can arrive here any number of times (its own REST response,
  /// a socket echo, a reconnect) and will only ever be added to the list
  /// once - this is what makes duplicates structurally impossible rather
  /// than something each call site has to remember to check.
  void _mergeMessage(ChatMessageModel message) {
    if (message.id.isEmpty || _messageIds.contains(message.id)) return;
    setState(() {
      _messageIds.add(message.id);
      _messages.add(message);
    });
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _sendText() async {
    final text = _textController.text.trim();
    if (text.isEmpty || _isSending || _myId == null) return;
    setState(() => _isSending = true);
    _textController.clear();
    try {
      final message = await _chatService.send(text, _myId!);
      _mergeMessage(message);
    } catch (e) {
      _showError(e, action: 'Message failed to send');
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  Future<void> _toggleRecording() async {
    if (_isRecording) {
      await _stopAndSendRecording();
      return;
    }
    try {
      await _recorder.start();
      _recorder.onMaxDurationReached = _stopAndSendRecording;
      if (!mounted) return;
      setState(() {
        _isRecording = true;
        _recordingElapsed = Duration.zero;
      });
      _recordingTicker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() => _recordingElapsed += const Duration(seconds: 1));
      });
    } catch (e) {
      _showError(e);
    }
  }

  Future<void> _cancelRecording() async {
    _recordingTicker?.cancel();
    await _recorder.cancel();
    if (mounted) setState(() => _isRecording = false);
  }

  Future<void> _stopAndSendRecording() async {
    _recordingTicker?.cancel();
    final recording = await _recorder.stop();
    if (mounted) setState(() => _isRecording = false);
    if (recording == null || _myId == null) return;

    if (mounted) setState(() => _isSending = true);
    try {
      final message = await _chatService.sendVoice(recording, _myId!);
      _mergeMessage(message);
    } catch (e) {
      _showError(e, action: 'Voice note failed to send');
    } finally {
      if (mounted) setState(() => _isSending = false);
      _deleteLocalFile(recording.localFilePath);
    }
  }

  Future<void> _deleteLocalFile(String path) async {
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();
    } catch (_) {
      // Best-effort cleanup only.
    }
  }

  void _showError(Object error, {String? action}) {
    if (!mounted) return;
    final reason = ErrorMessageMapper.toUserMessage(error);
    AppFeedbackDialog.showError(
      context,
      message: action == null ? reason : '$action. $reason',
    );
  }

  void _handleBack(BuildContext context) {
    final navigator = Navigator.of(context);
    if (navigator.canPop()) {
      navigator.pop();
    } else {
      navigator.pushNamedAndRemoveUntil('/home', (route) => false);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _messageSub?.cancel();
    _readSub?.cancel();
    _recordingTicker?.cancel();
    _recorder.dispose();
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      body: Column(
        children: [
          Container(
            width: double.infinity,
            color: AppColors.bgWhite,
            child: SafeArea(bottom: false, child: _buildHeader(context)),
          ),
          Expanded(
            child: SafeArea(
              top: false,
              child: Column(
                children: [
                  Expanded(child: _buildBody()),
                  if (_isRecording) _buildRecordingBar() else _buildComposer(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Container(
      height: 64,
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
      decoration: const BoxDecoration(
        color: AppColors.bgWhite,
        border: Border(bottom: BorderSide(color: Color(0xFFE5E5E5), width: 1)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () => _handleBack(context),
            icon: const Icon(LucideIcons.arrowLeft, size: 26, color: Color(0xFF1E1E1E)),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints.tightFor(width: 36, height: 36),
          ),
          const Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Chat with Office',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF141414), fontSize: 20, fontWeight: FontWeight.w500),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () => Navigator.of(context).pushNamed('/notifications'),
            icon: const Icon(LucideIcons.bell, size: 24, color: Color(0xFF1E1E1E)),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints.tightFor(width: 34, height: 34),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_loadError != null && _messages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_loadError!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: _loadMessages, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }
    return Column(
      children: [
        Expanded(
          child: _messages.isEmpty
              ? const Center(
                  child: Text('No messages yet. Say hello!', style: TextStyle(color: Colors.grey)),
                )
              : RefreshIndicator(
                  onRefresh: _loadMessages,
                  child: ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) => _buildBubble(_messages[index]),
                  ),
                ),
        ),
      ],
    );
  }

  Widget _buildBubble(ChatMessageModel message) {
    final isMine = message.isMine;
    final time = TimeOfDay.fromDateTime(message.createdAt).format(context);
    return Align(
      alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isMine ? const Color(0xFF2C57D3) : const Color(0xFFE1E1E1),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (message.isVoice)
              _buildVoiceBubbleContent(message, isMine)
            else
              Text(
                message.text,
                style: TextStyle(color: isMine ? Colors.white : const Color(0xFF141414), fontSize: 15),
              ),
            const SizedBox(height: 4),
            Text(
              time,
              style: TextStyle(
                color: isMine ? const Color(0xFFE1E8FF) : const Color(0xFF808080),
                fontSize: 11,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVoiceBubbleContent(ChatMessageModel message, bool isMine) {
    final voiceUrl = message.voiceUrl;
    if (voiceUrl == null) {
      return Text(
        'Voice note unavailable',
        style: TextStyle(color: isMine ? Colors.white70 : Colors.black45, fontSize: 13),
      );
    }
    final iconColor = isMine ? Colors.white : const Color(0xFF2C57D3);
    return StreamBuilder(
      stream: _audioPlayer.playerStateStream,
      builder: (context, snapshot) {
        final isActive = _audioPlayer.isActive(message.id);
        final isPlaying = isActive && (snapshot.data?.playing ?? false);
        return SizedBox(
          width: 160,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              InkWell(
                borderRadius: BorderRadius.circular(20),
                onTap: () => _audioPlayer.playOrToggle(message.id, voiceUrl),
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(
                    isPlaying ? LucideIcons.pause : LucideIcons.play,
                    color: iconColor,
                    size: 22,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: isActive
                    ? StreamBuilder<Duration>(
                        stream: _audioPlayer.positionStream,
                        builder: (context, posSnapshot) {
                          final total = _audioPlayer.duration ??
                              Duration(seconds: message.duration ?? 0);
                          final pos = posSnapshot.data ?? Duration.zero;
                          final ratio = total.inMilliseconds == 0
                              ? 0.0
                              : (pos.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0);
                          return LinearProgressIndicator(
                            value: ratio,
                            minHeight: 3,
                            backgroundColor: iconColor.withOpacity(0.25),
                            valueColor: AlwaysStoppedAnimation(iconColor),
                          );
                        },
                      )
                    : LinearProgressIndicator(
                        value: 0,
                        minHeight: 3,
                        backgroundColor: iconColor.withOpacity(0.25),
                        valueColor: AlwaysStoppedAnimation(iconColor),
                      ),
              ),
              const SizedBox(width: 6),
              Text(
                _formatDuration(Duration(seconds: message.duration ?? 0)),
                style: TextStyle(color: iconColor, fontSize: 11),
              ),
            ],
          ),
        );
      },
    );
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  Widget _buildComposer() {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      decoration: const BoxDecoration(
        color: AppColors.bgWhite,
        border: Border(top: BorderSide(color: Color(0xFFE5E5E5), width: 1)),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _textController,
              minLines: 1,
              maxLines: 4,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _sendText(),
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Message your office...',
                filled: true,
                fillColor: const Color(0xFFF5F5F5),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: const Color(0xFF2C57D3),
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: _isSending
                  ? null
                  : (_textController.text.trim().isNotEmpty ? _sendText : _toggleRecording),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: _isSending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : Icon(
                        _textController.text.trim().isNotEmpty ? LucideIcons.send : LucideIcons.mic,
                        color: Colors.white,
                        size: 20,
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecordingBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 12, 12),
      decoration: const BoxDecoration(
        color: AppColors.bgWhite,
        border: Border(top: BorderSide(color: Color(0xFFE5E5E5), width: 1)),
      ),
      child: Row(
        children: [
          const Icon(LucideIcons.mic, color: Color(0xFFEF4444), size: 20),
          const SizedBox(width: 10),
          Text(
            _formatDuration(_recordingElapsed),
            style: const TextStyle(fontSize: 15, color: Color(0xFF141414)),
          ),
          const Spacer(),
          TextButton(
            onPressed: _cancelRecording,
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF808080))),
          ),
          const SizedBox(width: 4),
          Material(
            color: const Color(0xFF2C57D3),
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: _stopAndSendRecording,
              child: const Padding(
                padding: EdgeInsets.all(12),
                child: Icon(LucideIcons.send, color: Colors.white, size: 20),
              ),
            ),
          ),
        ],
      ),
    );
  }
}