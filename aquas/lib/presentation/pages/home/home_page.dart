// lib/presentation/pages/home/home_page.dart

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:geolocator/geolocator.dart';
import '../../../config/theme/app_colors.dart';
import '../../../service_locator.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../../data/models/attendance_model.dart';
import '../../../data/models/lifecycle_model.dart';
import '../../../core/services/background_location_service.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _attendanceService = ServiceLocator().attendanceService;
  final _salaryService = ServiceLocator().salaryService;
  final _secureStorage = const FlutterSecureStorage();

  bool _isWorking = false;
  bool _isOnLeave = false;
  bool _hasCheckedIn = false;
  bool _isSiteFinished = false;
  late DateTime _workStartTime;
  late Duration _elapsedTime;
  Timer? _timer;
  int _totalDaysWorked = 0;
  double _totalHoursWorked = 0.0;
  String _firstName = '';
  String _currentMonthName = '';
  double _advancesTotal = 0.0;
  double _totalEarnings = 0.0;
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _elapsedTime = Duration.zero;
    _loadInitialState();
    unawaited(ServiceLocator().pushNotificationService.initialize());

    // Surface every step of the on-demand location flow as a SnackBar so
    // it's visible directly on the phone without needing a terminal -
    // "connected", "dashboard requested your location", "permission
    // denied", etc.
    ServiceLocator().realtimeService.onStatus = (message) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), duration: const Duration(seconds: 3)),
      );
    };
    unawaited(ServiceLocator().realtimeService.connect());
    BackgroundLocationService().start();
  }

  /// Pulls today's check-in/out status, this month's totals, and - most
  /// importantly - the authoritative lifecycle state from the backend
  /// (`/api/mobile/assignment-status`) so the screen reflects reality
  /// instead of a locally-guessed "is there a company object" heuristic.
  /// Display name only - assignment/lifecycle truth comes from
  /// getAssignmentStatus(), not from this.
  Future<String> _fetchDisplayName() async {
    try {
      final resp = await ServiceLocator().apiClient.get('/api/mobile/profile');
      final pdata = resp.data['data'] as Map<String, dynamic>?;
      final name = pdata?['name']?.toString() ?? '';
      return name.isNotEmpty ? name.split(' ').first : '';
    } catch (_) {
      return _firstName; // keep whatever we already had rather than blanking it
    }
  }

  Future<double> _fetchAdvancesTotal() async {
    try {
      final adv = await _salaryService.getAdvances();
      return adv.total;
    } catch (_) {
      return 0.0;
    }
  }

  Future<double> _fetchTotalEarningsForMonth() async {
    try {
      final slips = await _salaryService.getSalarySlips();
      if (slips.isEmpty) return 0.0;

      final now = DateTime.now();
      // Robust month matching: backend may return month as a name or numeric string
      int? parseMonth(String m) {
        final trimmed = m.trim();
        final n = int.tryParse(trimmed);
        if (n != null && n >= 1 && n <= 12) return n;
        const names = [
          '',
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December'
        ];
        for (var i = 1; i <= 12; i++) {
          if (trimmed.toLowerCase() == names[i].toLowerCase() ||
              trimmed.toLowerCase().startsWith(names[i].toLowerCase().substring(0, 3))) {
            return i;
          }
        }
        return null;
      }

      final matched = slips.where((s) {
        final mIdx = parseMonth(s.month);
        return mIdx != null && mIdx == now.month && s.year == now.year;
      }).toList();

      if (matched.isNotEmpty) {
        return matched.map((s) => s.netSalary).fold<double>(0.0, (a, b) => a + b);
      }
      // fallback: sum of latest 1-3 slips
      return slips.take(3).map((s) => s.netSalary).fold<double>(0.0, (a, b) => a + b);
    } catch (_) {
      return 0.0;
    }
  }

  Future<AssignmentStatus> _fetchAssignmentStatus() async {
    try {
      return await _attendanceService.getAssignmentStatus();
    } catch (e) {
      // Safe fallback: show Waiting for Site rather than leave the whole
      // screen stuck if this single call fails.
      return AssignmentStatus(lifecycleState: 'WAITING_FOR_COMPANY', isAssigned: false, isOnLeave: false);
    }
  }

  Future<AttendanceRecord?> _fetchToday() async {
    try {
      return await _attendanceService.getToday();
    } catch (_) {
      return null;
    }
  }

  Future<MonthlySummary> _fetchMonthlySummary() async {
    try {
      return await _attendanceService.getMonthlySummary();
    } catch (_) {
      final now = DateTime.now();
      return MonthlySummary(month: now.month, year: now.year, daysPresent: 0, totalHours: 0, days: const []);
    }
  }

  Future<void> _loadInitialState() async {
    try {
      // All six of these are independent - fetching them in parallel
      // instead of one-after-another is the single biggest speed win for
      // this screen, since it's the first thing shown after login.
      // Each of these fetches independently so one transient failure (e.g.
      // a single flaky request) can't silently block every other KPI/state
      // update on this screen - previously a single unguarded failure here
      // aborted the whole batch and nothing on screen would refresh.
      final results = await Future.wait([
        _fetchAssignmentStatus(),
        _fetchToday(),
        _fetchMonthlySummary(),
        _fetchDisplayName(),
        _fetchAdvancesTotal(),
        _fetchTotalEarningsForMonth(),
      ]);

      final status = results[0] as AssignmentStatus;
      final today = results[1] as AttendanceRecord?;
      final summary = results[2] as MonthlySummary;
      _firstName = results[3] as String;
      _advancesTotal = results[4] as double;
      _totalEarnings = results[5] as double;

      // Determine month name for display
      final monthIndex = summary.month;
      const monthNames = [
        '',
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December'
      ];
      _currentMonthName = (monthIndex >= 1 && monthIndex <= 12) ? monthNames[monthIndex] : '';

      // Map the backend's authoritative lifecycleState onto the four local
      // UI flags. This is the single source of truth - no more locally
      // persisted "site finished" flag that can go stale.
      final state = status.lifecycleState;
      final isWorking = state == 'WORKING';
      final isOnLeave = state == 'ON_LEAVE';
      final isSiteFinished = state == 'WAITING_FOR_COMPANY';
      final hasCheckedIn = state == 'CHECKED_IN' || state == 'WORKING';

      _timer?.cancel();
      if (isWorking) {
        // Best-effort: resume the on-screen timer from today's recorded
        // check-in time so it doesn't reset to 0:00 after an app restart.
        DateTime start = DateTime.now();
        final checkInTime = today?.checkIn;
        if (checkInTime != null && checkInTime.contains(':')) {
          final parts = checkInTime.split(':');
          final hh = int.tryParse(parts[0]);
          final mm = int.tryParse(parts[1]);
          if (hh != null && mm != null) {
            final now = DateTime.now();
            start = DateTime(now.year, now.month, now.day, hh, mm);
          }
        }
        _workStartTime = start;
        _elapsedTime = DateTime.now().difference(_workStartTime);
        _timer = Timer.periodic(const Duration(seconds: 1), (_) {
          if (!mounted) return;
          setState(() {
            _elapsedTime = DateTime.now().difference(_workStartTime);
          });
        });
      }

      if (!mounted) return;
      setState(() {
        _totalDaysWorked = summary.daysPresent;
        _totalHoursWorked = summary.totalHours;
        _isWorking = isWorking;
        _isOnLeave = isOnLeave;
        _isSiteFinished = isSiteFinished;
        _hasCheckedIn = hasCheckedIn;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not load your attendance: $e'),
          backgroundColor: AppColors.errorRed,
        ),
      );
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    BackgroundLocationService().stop();
    super.dispose();
  }

  /// Ensures location permission is granted (requesting it if needed) and
  /// returns the current position, or null if permission was denied or the
  /// position couldn't be determined. Centralizes what each lifecycle
  /// action (check-in/start/stop work/site-finished) uses to capture GPS -
  /// previously each one only called Geolocator.getCurrentPosition
  /// directly, which silently returned nothing if the separate onboarding
  /// permission screen had been skipped or denied.
  Future<Position?> _getCurrentPositionOrNull() async {
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return null;
      }

      if (!await Geolocator.isLocationServiceEnabled()) {
        return null;
      }

      return await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.best);
    } catch (_) {
      return null;
    }
  }

  Future<void> _checkIn() async {
    if (_isSubmitting) return;
    setState(() => _isSubmitting = true);
    try {
      await _attendanceService.checkIn();
      if (!mounted) return;
      setState(() {
        _hasCheckedIn = true;
        _isWorking = false;
        _isOnLeave = false;
        _isSiteFinished = false;
        _elapsedTime = Duration.zero;
        _isSubmitting = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Check-in successful. Attendance marked for today.'),
          backgroundColor: AppColors.successGreen,
        ),
      );

      _captureLocationInBackground('check_in');
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Check-in failed: $e'), backgroundColor: AppColors.errorRed),
      );
    }
  }

  /// Fetches the current position and sends it as a standalone location
  /// ping, without blocking whatever action triggered it. Lifecycle actions
  /// (check-in/start/stop work/site-finished) call this AFTER already
  /// confirming the status change with the backend, so a slow GPS fix never
  /// delays the attendance/status update the dashboard is waiting to see.
  void _captureLocationInBackground(String event) {
    unawaited(() async {
      final pos = await _getCurrentPositionOrNull();
      if (pos == null) return;
      await _attendanceService.pingLocation(
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy: pos.accuracy,
        event: event,
      );
    }());
  }

  Future<void> _startWork() async {
    if (_isSubmitting) return;
    setState(() => _isSubmitting = true);
    try {
      await _attendanceService.startWork();
      if (!mounted) return;

      setState(() {
        _isWorking = true;
        _isOnLeave = false;
        _isSiteFinished = false;
        _workStartTime = DateTime.now();
        _elapsedTime = Duration.zero;
        _isSubmitting = false;
      });

      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        setState(() {
          _elapsedTime = DateTime.now().difference(_workStartTime);
        });
      });

      _captureLocationInBackground('start_work');
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not start work: $e'), backgroundColor: AppColors.errorRed),
      );
    }
  }

  Future<void> _stopWork() async {
    _timer?.cancel();

    _showHoursSelectionDialog();
  }

  void _resumeWorkAfterDialogCancel() {
    if (!_isWorking) return;

    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || !_isWorking) return;
      setState(() {
        _elapsedTime = DateTime.now().difference(_workStartTime);
      });
    });
  }

  void _showHoursSelectionDialog() {
    int selectedHour = (_elapsedTime.inMinutes / 60.0).ceil();
    if (selectedHour < 1) selectedHour = 11;
    if (selectedHour > 24) selectedHour = 24;

    showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return Dialog(
              backgroundColor: Colors.transparent,
              insetPadding: const EdgeInsets.symmetric(
                horizontal: 18,
                vertical: 24,
              ),
              child: Container(
                padding: const EdgeInsets.fromLTRB(24, 22, 24, 24),
                decoration: BoxDecoration(
                  color: AppColors.bgWhite,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Select Total Hour',
                            style: TextStyle(
                              color: Color(0xFF141414),
                              fontSize: 24,
                              fontWeight: FontWeight.w500,
                              fontFamily: 'Sans Serif',
                            ),
                          ),
                        ),
                        IconButton(
                          onPressed: () {
                            Navigator.of(context).pop(false);
                          },
                          icon: const Icon(
                            Icons.close,
                            color: Color(0xFF1E1E1E),
                            size: 34,
                          ),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(
                            minWidth: 36,
                            minHeight: 36,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: 24,
                      gridDelegate:
                          const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 4,
                            crossAxisSpacing: 14,
                            mainAxisSpacing: 14,
                            childAspectRatio: 1,
                          ),
                      itemBuilder: (context, index) {
                        final hour = index + 1;
                        final isSelected = hour == selectedHour;

                        return Material(
                          color: Colors.transparent,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(14),
                            onTap: () {
                              setDialogState(() {
                                selectedHour = hour;
                              });
                            },
                            child: Ink(
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? const Color(0xFF2C59D8)
                                    : const Color(0xFFDEDEE1),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Center(
                                child: Text(
                                  '$hour',
                                  style: TextStyle(
                                    color: isSelected
                                        ? Colors.white
                                        : const Color(0xFF141414),
                                    fontSize: 50 / 2,
                                    fontWeight: FontWeight.w500,
                                    fontFamily: 'Sans Serif',
                                  ),
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      height: 64,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: const Color(0xFF3DAF00),
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: () async {
                              Navigator.of(context).pop(true);
                              await _saveWorkSession(selectedHour.toDouble());
                            },
                            child: const Center(
                              child: Text(
                                'Done',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 24,
                                  fontWeight: FontWeight.w400,
                                  fontFamily: 'Sans Serif',
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    ).then((didSave) {
      if (!mounted) return;
      if (didSave == true) return;
      _resumeWorkAfterDialogCancel();
    });
  }

  // Note: the backend computes actual hours worked from the check-in/out
  // timestamps rather than trusting a manually-picked number, so the value
  // the person taps in the dialog is used to drive the UI transition while
  // the real number comes back from the check-out response.
  Future<void> _saveWorkSession(double pickedHours) async {
    try {
      final result = await _attendanceService.stopWork(hoursWorked: pickedHours);
      if (!mounted) return;
      setState(() {
        _isWorking = false;
        _hasCheckedIn = true;
      });
      unawaited(_loadInitialState()); // refresh the month's real totals from the server
      _captureLocationInBackground('stop_work');

      final hoursWorked = result.hoursWorked ?? pickedHours;

      // Show a confirmation dialog with today's hours (backend computes the
      // authoritative value from the work session).
      if (!mounted) return;
      showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Work session saved'),
          content: Text('Today you worked ${hoursWorked.toStringAsFixed(1)} hours.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    } catch (e) {
      if (!mounted) return;
      _resumeWorkAfterDialogCancel();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not save work session: $e'), backgroundColor: AppColors.errorRed),
      );
    }
  }

  Future<void> _sendLocationPing({String? event}) async {
    try {
      final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.best);
      await _attendanceService.pingLocation(
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy: pos.accuracy,
        event: event,
      );
    } catch (_) {
      // Best-effort: do not surface location ping failures to the user.
    }
  }

  // "Total Hours Worked" always reflects the real month-to-date total from
  // the backend (getMonthlySummary - resets naturally each month since it's
  // computed from that month's Attendance records). This used to fall back
  // to a hardcoded 2.0 "preview" the moment the employee checked in or
  // started work, which is why the card always jumped to a fixed "2hr"
  // regardless of actual hours worked. There is nothing meaningful to
  // preview here - today's contribution isn't known until Stop Work saves
  // the actual hoursWorked and _saveWorkSession refreshes this value from
  // the server - so we just always show the real total.
  double _displayedHoursWorked() => _totalHoursWorked;

  Future<void> _siteFinished() async {
    if (_isSubmitting) return;
    setState(() => _isSubmitting = true);
    try {
      await _attendanceService.siteFinished();
      if (!mounted) return;

      setState(() {
        _isSiteFinished = true;
        _isWorking = false;
        _hasCheckedIn = false;
        _isOnLeave = false;
        _isSubmitting = false;
      });

      _timer?.cancel();

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Site marked as finished'),
          backgroundColor: AppColors.errorRed,
        ),
      );

      _captureLocationInBackground('site_finished');
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not finish site: $e'), backgroundColor: AppColors.errorRed),
      );
    }
  }

  Future<void> _takeLeave() async {
    if (_isSubmitting) return;
    setState(() => _isSubmitting = true);
    try {
      await _attendanceService.startLeave();
      if (!mounted) return;

      setState(() {
        _isOnLeave = true;
        _isWorking = false;
        _hasCheckedIn = false;
        _isSiteFinished = false;
        _isSubmitting = false;
      });

      _timer?.cancel();

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Leave marked successfully'),
          backgroundColor: AppColors.warningYellow,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not start leave: $e'), backgroundColor: AppColors.errorRed),
      );
    }
  }

  Future<void> _endLeave() async {
    if (_isSubmitting) return;
    setState(() => _isSubmitting = true);
    try {
      final result = await _attendanceService.endLeave();
      if (!mounted) return;

      setState(() {
        _isOnLeave = false;
        _isSiteFinished = result.lifecycleState == 'WAITING_FOR_COMPANY';
        _hasCheckedIn = result.lifecycleState == 'CHECKED_IN';
        _isWorking = false;
        _isSubmitting = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Leave ended'),
          backgroundColor: AppColors.successGreen,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not end leave: $e'), backgroundColor: AppColors.errorRed),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final sw = mq.size.width;
    final sh = mq.size.height;
    const baseW = 412.0;
    const baseH = 917.0;
    final sx = sw / baseW;
    final sy = sh / baseH;
    final sf = sx < sy ? sx : sy;

    double w(double v) => v * sx;
    double h(double v) => v * sy;
    double f(double v) => v * sf;

    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      body: Column(
        children: [
          // White wrapper so the status bar area renders white on every
          // device, and the header keeps the same h(68) height/background
          // used by Payment, Calendar, etc.
          Container(
            width: double.infinity,
            color: AppColors.bgWhite,
            child: SafeArea(
              bottom: false,
              child: _buildHeader(context, w, h, f),
            ),
          ),
          Expanded(
            child: SafeArea(
              top: false,
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                layoutBuilder: (currentChild, previousChildren) {
                  return Stack(
                    alignment: Alignment.topCenter,
                    children: [
                      ...previousChildren,
                      ?currentChild,
                    ],
                  );
                },
                child: _isSiteFinished
                    ? KeyedSubtree(
                        key: const ValueKey('site-finished'),
                        child: _buildSiteFinishedContent(w, h, f),
                      )
                    : KeyedSubtree(
                        key: const ValueKey('default-home'),
                        child: _buildDefaultHomeContent(w, h, f),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPageContent({
    required Widget child,
    required double Function(double) h,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.max,
      children: [
        SizedBox(height: h(24)),
        Expanded(child: child),
      ],
    );
  }

  Widget _buildDefaultHomeContent(
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    return _buildPageContent(
      h: h,
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: EdgeInsets.fromLTRB(w(16), 0, w(16), h(27)),
      child: Column(
        children: [
          _buildInfoCard(
            w: w,
            h: h,
            f: f,
            icon: LucideIcons.hourglass,
            title: 'Total Hours Worked',
            value: _displayedHoursWorked().toStringAsFixed(0),
            valueSuffix: 'hr',
            date: _currentMonthName.isNotEmpty ? _currentMonthName : 'June',
          ),
          SizedBox(height: h(16)),
          _buildInfoCard(
            w: w,
            h: h,
            f: f,
            icon: LucideIcons.calendarDays,
            title: 'Total Number of Days',
            value: '$_totalDaysWorked',
            date: _currentMonthName.isNotEmpty ? _currentMonthName : 'June',
          ),
          SizedBox(height: h(24)),
          if (_isOnLeave) ...[
            _buildActionButton(
              w: w,
              h: h,
              f: f,
              label: 'Check In',
              color: const Color(0xFF95A7E6),
              borderColor: const Color(0xFF95A7E6),
              icon: LucideIcons.circlePlay,
              onPressed: null,
            ),
            SizedBox(height: h(32)),
            _buildActionButton(
              w: w,
              h: h,
              f: f,
              label: 'Site Finished',
              color: const Color(0xFFE293A8),
              borderColor: const Color(0xFFD9889E),
              onPressed: null,
            ),
            SizedBox(height: h(32)),
            _buildActionButton(
              w: w,
              h: h,
              f: f,
              label: 'End Leave - 01 Day',
              color: const Color(0xFFF2B128),
              borderColor: const Color(0xFFE0A320),
              onPressed: _endLeave,
            ),
          ] else if (_hasCheckedIn && !_isWorking)
            _buildCheckInButton(
              w: w,
              h: h,
              f: f,
              label: 'Start Work',
              icon: LucideIcons.circlePlay,
              onPressed: _startWork,
              buttonHeight: h(120),
              borderColor: const Color(0xFF2F8E00),
              backgroundColor: const Color(0xFF3EA500),
              glowColor: const Color(0xFF2F8E00),
            )
          else if (_isWorking)
            _buildCheckInButton(
              w: w,
              h: h,
              f: f,
              label: 'Stop Work',
              icon: LucideIcons.circleStop,
              onPressed: _stopWork,
              buttonHeight: h(120),
              borderColor: const Color(0xFFCA0029),
              backgroundColor: const Color(0xFFE4002B),
              glowColor: const Color(0xFFCA0029),
            )
          else
            _buildCheckInButton(
              w: w,
              h: h,
              f: f,
              label: 'Check In',
              icon: LucideIcons.circlePlay,
              onPressed: _checkIn,
            ),
          if (!_isOnLeave && !_isWorking) ...[
            SizedBox(height: h(32)),
            _buildActionButton(
              w: w,
              h: h,
              f: f,
              label: 'Site Finished',
              color: const Color(0xFFE50020),
              borderColor: const Color(0xFFD6001E),
              onPressed: _siteFinished,
            ),
            SizedBox(height: h(32)),
            _buildActionButton(
              w: w,
              h: h,
              f: f,
              label: 'Take leave',
              color: const Color(0xFFFFB629),
              borderColor: const Color(0xFFF0AB27),
              onPressed: _takeLeave,
            ),
          ],
          SizedBox(height: h(27)),
        ],
      ),
      ),
    );
  }

  Widget _buildSiteFinishedContent(
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    return _buildPageContent(
      h: h,
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: EdgeInsets.fromLTRB(w(16), 0, w(16), h(27)),
      child: Column(
        children: [
          _buildInfoCard(
            w: w,
            h: h,
            f: f,
            icon: LucideIcons.hourglass,
            title: 'Total Hours Worked',
            value: _displayedHoursWorked().toStringAsFixed(0),
            valueSuffix: 'hr',
            date: _currentMonthName.isNotEmpty ? _currentMonthName : 'June',
          ),
          SizedBox(height: h(16)),
          _buildInfoCard(
            w: w,
            h: h,
            f: f,
            icon: LucideIcons.calendarDays,
            title: 'Total Number of Days',
            value: '$_totalDaysWorked',
            date: _currentMonthName.isNotEmpty ? _currentMonthName : 'June',
          ),
          SizedBox(height: h(32)),
          _buildWaitingForSiteButton(w: w, h: h, f: f),
          SizedBox(height: h(27)),
        ],
      ),
      ),
    );
  }

  Widget _buildWaitingForSiteButton({
    required double Function(double) w,
    required double Function(double) h,
    required double Function(double) f,
  }) {
    return SizedBox(
      width: w(380),
      height: h(80),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xFF8A8A8A),
          borderRadius: BorderRadius.circular(w(20)),
        ),
        child: Center(
          child: Text(
            'Waiting for Site',
            style: TextStyle(
              color: Colors.white,
              fontSize: f(24),
              fontWeight: FontWeight.w400,
              fontFamily: 'Sans Serif',
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(
    BuildContext context,
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    return Container(
      height: h(68),
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(w(16), h(8), w(16), h(8)),
      decoration: const BoxDecoration(
        color: AppColors.bgWhite,
        border: Border(bottom: BorderSide(color: Color(0xFFD7D7D7), width: 1)),
      ),
      child: Row(
        children: [
          Material(
            color: Colors.transparent,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: () => Navigator.of(context).pushNamed('/profile'),
              child: Container(
                width: w(44),
                height: w(44),
                decoration: const BoxDecoration(
                  color: Color(0xFFDDDDE3),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  LucideIcons.user,
                  size: w(26),
                  color: const Color(0xFF8C8C96),
                ),
              ),
            ),
          ),
          SizedBox(width: w(12)),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Hello,',
                  style: TextStyle(
                    color: const Color(0xFF5F5F6F),
                    fontFamily: 'Sans Serif',
                    fontSize: f(11),
                    fontStyle: FontStyle.normal,
                    fontWeight: FontWeight.w400,
                    height: 16 / 11, // line-height: 16px
                  ),
                ),
                Text(
                  _firstName.isNotEmpty ? '${_firstName}!' : 'Ramesh!',
                  style: TextStyle(
                    color: const Color(0xFF141414),
                    fontFamily: 'Sans Serif',
                    fontSize: f(24),
                    fontStyle: FontStyle.normal,
                    fontWeight: FontWeight.w500,
                    height: 20 / 24, // line-height: 20px
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () =>
                Navigator.of(context).pushNamed('/notifications'),
            icon: Icon(
              LucideIcons.bell,
              size: w(24),
              color: const Color(0xFF818181),
            ),
            padding: EdgeInsets.zero,
            constraints: BoxConstraints.tightFor(width: w(34), height: w(34)),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoCard({
    required double Function(double) w,
    required double Function(double) h,
    required double Function(double) f,
    required IconData icon,
    required String title,
    required String value,
    required String date,
    String? valueSuffix,
  }) {
    return Container(
      width: w(380),
      height: 158,

      padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),

      decoration: BoxDecoration(
        color: AppColors.bgWhite,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFDEDEDE), width: 1),
        boxShadow: const [
          BoxShadow(
            color: Color.fromRGBO(95, 95, 111, 0.10),
            blurRadius: 2,
            offset: Offset(0, 0),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          /// TOP ROW
          Row(
            children: [
              /// ICON
              Container(
                width: 44,
                height: 44,
                decoration: const BoxDecoration(
                  color: Color(0xFFDDE5FC),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Icon(icon, size: 24, color: Color(0xFF2C59D8)),
                ),
              ),

              const Spacer(),

              /// MONTH
              Text(
                date,

                textHeightBehavior: const TextHeightBehavior(
                  applyHeightToFirstAscent: false,
                  applyHeightToLastDescent: false,
                ),

                strutStyle: const StrutStyle(
                  forceStrutHeight: true,
                  height: 1.0,
                ),

                style: TextStyle(
                  color: const Color(0xFF969696),
                  fontSize: f(18),
                  fontStyle: FontStyle.italic,
                  fontWeight: FontWeight.w400,
                  fontFamily: 'Sans Serif',
                  height: 1.0,
                ),
              ),
            ],
          ),

          /// GAP
          const SizedBox(height: 12),

          /// TITLE
          Text(
            title,

            textHeightBehavior: const TextHeightBehavior(
              applyHeightToFirstAscent: false,
              applyHeightToLastDescent: false,
            ),

            strutStyle: const StrutStyle(forceStrutHeight: true, height: 1.0),

            style: TextStyle(
              color: const Color(0xFF808080),
              fontSize: f(16),
              fontWeight: FontWeight.w400,
              fontFamily: 'Sans Serif',
              height: 26 / 16,
            ),
          ),

          /// GAP
          const SizedBox(height: 8),

          /// VALUE
          RichText(
            textHeightBehavior: const TextHeightBehavior(
              applyHeightToFirstAscent: false,
              applyHeightToLastDescent: false,
            ),

            text: TextSpan(
              children: [
                /// MAIN VALUE
                TextSpan(
                  text: value,
                  style: TextStyle(
                    color: const Color(0xFF141414),
                    fontSize: f(32),
                    fontWeight: FontWeight.w500,
                    fontFamily: 'Sans Serif',
                    height: 1.0,
                  ),
                ),

                /// SUFFIX
                if (valueSuffix != null)
                  TextSpan(
                    text: valueSuffix,
                    style: TextStyle(
                      color: const Color(0xFF808080),
                      fontSize: f(18),
                      fontWeight: FontWeight.w400,
                      fontFamily: 'Sans Serif',
                      height: 1.0,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCheckInButton({
    required double Function(double) w,
    required double Function(double) h,
    required double Function(double) f,
    required String label,
    required IconData icon,
    required VoidCallback? onPressed,
    double? buttonHeight,
    Color borderColor = const Color(0xFF1942B8),
    Color backgroundColor = const Color(0xFF1D4ED8),
    Color glowColor = const Color(0xFF1942B8),
  }) {
    return Container(
      width: w(380),
      height: buttonHeight ?? h(80),

      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),

        /// BORDER
        border: Border.all(color: borderColor, width: 2),

        /// BASE COLOR
        color: backgroundColor,

        /// OUTER SHADOWS
        boxShadow: const [
          /// 0 6px 11px 0 rgba(0,0,0,0.25)
          BoxShadow(
            color: Color.fromRGBO(0, 0, 0, 0.25),
            blurRadius: 11,
            offset: Offset(0, 6),
          ),

          /// 0 0 12px 0 rgba(0,0,0,0.27)
          BoxShadow(
            color: Color.fromRGBO(0, 0, 0, 0.27),
            blurRadius: 12,
            offset: Offset(0, 0),
          ),
        ],
      ),

      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),

        child: Stack(
          children: [
            /// LEFT INNER GLOW
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: glowColor,
                      blurRadius: 30,
                      offset: Offset(-7, 0),
                    ),
                  ],
                ),
              ),
            ),

            /// TOP INNER GLOW
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: glowColor,
                      blurRadius: 30,
                      offset: Offset(0, -7),
                    ),
                  ],
                ),
              ),
            ),

            /// RIGHT INNER GLOW
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: glowColor,
                      blurRadius: 30,
                      offset: Offset(7, 0),
                    ),
                  ],
                ),
              ),
            ),

            /// BOTTOM INNER GLOW
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: glowColor,
                      blurRadius: 30,
                      offset: Offset(0, 7),
                    ),
                  ],
                ),
              ),
            ),

            /// BUTTON CONTENT
            Material(
              color: Colors.transparent,

              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: onPressed,

                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 4,
                  ),

                  child: Center(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.center,

                      children: [
                        /// ICON
                        SizedBox(
                          width: 32,
                          height: 32,

                          child: Icon(icon, size: 32, color: Colors.white),
                        ),

                        const SizedBox(width: 10),

                        /// TEXT
                        Text(
                          label,

                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: f(32),
                            color: Colors.white,
                            fontWeight: FontWeight.w500,
                            fontFamily: 'Sans Serif',
                            height: 1.0,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButton({
    required double Function(double) w,
    required double Function(double) h,
    required double Function(double) f,
    required String label,
    required Color color,
    required Color borderColor,
    IconData? icon,
    required VoidCallback? onPressed,
  }) {
    return SizedBox(
      width: w(380),
      height: h(80),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: onPressed == null ? color.withAlpha(150) : color,
          borderRadius: BorderRadius.circular(w(12)),
          border: Border.all(color: borderColor, width: 2),
          boxShadow: const [
            BoxShadow(
              color: Color(0x12000000),
              blurRadius: 6,
              spreadRadius: 0,
              offset: Offset(0, 0),
            ),
            BoxShadow(
              color: Color(0x40000000),
              blurRadius: 6,
              spreadRadius: 0,
              offset: Offset(0, 1),
            ),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(w(12)),
            onTap: onPressed,
            child: Center(
              child: icon == null
                  ? Text(
                      label,
                      style: TextStyle(
                        fontSize: f(32),
                        color: Colors.white,
                        fontWeight: FontWeight.w500,
                        fontFamily: 'Sans Serif',
                      ),
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(icon, color: Colors.white, size: w(34)),
                        SizedBox(width: w(12)),
                        Text(
                          label,
                          style: TextStyle(
                            fontSize: f(32),
                            color: Colors.white,
                            fontWeight: FontWeight.w500,
                            fontFamily: 'Sans Serif',
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }

}