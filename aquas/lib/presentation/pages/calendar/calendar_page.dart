// lib/presentation/pages/calendar/calendar_page.dart

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../config/theme/app_colors.dart';
import '../../../service_locator.dart';
import '../../../data/models/attendance_model.dart';

class CalendarPage extends StatefulWidget {
  const CalendarPage({super.key});

  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  late DateTime _currentMonth;
  DateTime? _selectedDate;
  bool _loading = true;
  List<AttendanceRecord> _days = [];
  int _presentCount = 0;
  int _leaveCount = 0;
  int _absentCount = 0;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _currentMonth = DateTime(now.year, now.month, 1);
    _selectedDate = null;
    _loadMonthlySummary();
  }

  Future<void> _loadMonthlySummary() async {
    try {
      final summary = await ServiceLocator().attendanceService.getMonthlySummary(
        month: _currentMonth.month,
        year: _currentMonth.year,
      );
      // derive simple counts for the summary cards
      var present = 0;
      var leave = 0;
      var absent = 0;
      for (final d in summary.days) {
        final status = d.status.toLowerCase();
        if (status.contains('present') || status.contains('complete') || status.contains('checked-in')) {
          present++;
        } else if (status.contains('leave') || status.contains('holiday')) {
          leave++;
        } else if (status.contains('absent')) {
          absent++;
        }
      }

      setState(() {
        _days = summary.days;
        _presentCount = present;
        _leaveCount = leave;
        _absentCount = absent;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _days = [];
        _presentCount = 0;
        _leaveCount = 0;
        _absentCount = 0;
        _loading = false;
      });
    }
  }

  void _previousMonth() {
    setState(() {
      _currentMonth = DateTime(_currentMonth.year, _currentMonth.month - 1, 1);
      if (_selectedDate != null &&
          (_selectedDate!.year != _currentMonth.year ||
              _selectedDate!.month != _currentMonth.month)) {
        _selectedDate = null;
      }
    });
    _loadMonthlySummary();
  }

  void _nextMonth() {
    setState(() {
      _currentMonth = DateTime(_currentMonth.year, _currentMonth.month + 1, 1);
      if (_selectedDate != null &&
          (_selectedDate!.year != _currentMonth.year ||
              _selectedDate!.month != _currentMonth.month)) {
        _selectedDate = null;
      }
    });
    _loadMonthlySummary();
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
          // device, matching the rest of the app.
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
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                padding: EdgeInsets.fromLTRB(w(16), h(24), w(16), h(16)),
                child: Column(
                  children: [
                    _buildMonthSelector(w, h, f),
                    SizedBox(height: h(22)),
                    _buildCalendarGrid(w, h, f),
                    if (_selectedDate != null) ...[
                      SizedBox(height: h(16)),
                      _buildSelectedDayDetailsCard(w, h, f),
                    ],
                    SizedBox(height: h(20)),
                    Container(
                      width: w(380),
                      height: 1,
                      color: const Color(0xFFCCCCD1),
                    ),
                    SizedBox(height: h(22)),
                    _buildBreakdownCard(
                      w: w,
                      h: h,
                      f: f,
                      title: 'Total Day Work',
                      amount: _loading ? '—' : '$_presentCount',
                      iconBg: const Color(0xFF169C2E),
                      cardBg: const Color(0xFFD1E0D6),
                      borderColor: const Color(0xFF8CC8A0),
                    ),
                    SizedBox(height: h(14)),
                    _buildBreakdownCard(
                      w: w,
                      h: h,
                      f: f,
                      title: 'Total Leave',
                      amount: _loading ? '—' : '$_leaveCount',
                      iconBg: const Color(0xFFF7B933),
                      cardBg: const Color(0xFFF0E5C8),
                      borderColor: const Color(0xFFECCF84),
                    ),
                    SizedBox(height: h(14)),
                    _buildBreakdownCard(
                      w: w,
                      h: h,
                      f: f,
                      title: 'Total Absent',
                      amount: _loading ? '—' : '$_absentCount',
                      iconBg: const Color(0xFFFF2D55),
                      cardBg: const Color(0xFFEFC2CD),
                      borderColor: const Color(0xFFF1A2B5),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
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
          SizedBox(width: w(10)),
          Expanded(
            child: Text(
              'Calendar',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: const Color(0xFF141414),
                fontSize: f(24),
                fontWeight: FontWeight.w500,
                fontFamily: 'Sans Serif',
              ),
            ),
          ),
          IconButton(
            onPressed: () => Navigator.of(context).pushNamed('/notifications'),
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

  Widget _buildMonthSelector(
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        _buildMonthNavButton(
          w: w,
          h: h,
          icon: LucideIcons.chevronLeft,
          onPressed: _previousMonth,
        ),
        Column(
          children: [
            Text(
              _getMonthName(_currentMonth.month),
              style: TextStyle(
                color: const Color(0xFF141414),
                fontSize: f(52 / 2),
                fontWeight: FontWeight.w500,
                fontFamily: 'Sans Serif',
                height: 1,
              ),
            ),
            SizedBox(height: h(4)),
            Text(
              '${_currentMonth.year}',
              style: TextStyle(
                color: const Color(0xFF808080),
                fontSize: f(16),
                fontWeight: FontWeight.w400,
                fontFamily: 'Sans Serif',
                height: 1,
              ),
            ),
          ],
        ),
        _buildMonthNavButton(
          w: w,
          h: h,
          icon: LucideIcons.chevronRight,
          onPressed: _nextMonth,
        ),
      ],
    );
  }

  Widget _buildMonthNavButton({
    required double Function(double) w,
    required double Function(double) h,
    required IconData icon,
    required VoidCallback onPressed,
  }) {
    return SizedBox(
      width: w(36),
      height: h(36),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xFFF1F2F9),
          border: Border.all(color: const Color(0xFFD0D3E0), width: 1),
          borderRadius: BorderRadius.circular(w(10)),
        ),
        child: IconButton(
          onPressed: onPressed,
          icon: Icon(icon, color: const Color(0xFF1D1D1F), size: w(28)),
          padding: EdgeInsets.zero,
        ),
      ),
    );
  }

  Widget _buildCalendarGrid(
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    final cells = _buildCalendarCells();

    return Column(
      children: [
        Row(
          children: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
              .map(
                (day) => Expanded(
                  child: Center(
                    child: Text(
                      day,
                      style: TextStyle(
                        color: const Color(0xFF808080),
                        fontSize: f(20),
                        fontWeight: FontWeight.w400,
                        fontFamily: 'Sans Serif',
                      ),
                    ),
                  ),
                ),
              )
              .toList(),
        ),
        SizedBox(height: h(12)),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: cells.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 7,
            mainAxisSpacing: h(12),
            crossAxisSpacing: w(8),
            childAspectRatio: 1,
          ),
          itemBuilder: (context, index) {
            final cell = cells[index];
            return _buildDayCell(cell, w, h, f);
          },
        ),
      ],
    );
  }

  Widget _buildDayCell(
    _CalendarCell cell,
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    final isSelected =
        _selectedDate != null &&
        cell.date != null &&
        _isSameDay(_selectedDate!, cell.date!);
    final fillColor = isSelected ? const Color(0xFF2C59D8) : cell.fillColor;
    final textColor = isSelected ? Colors.white : cell.textColor;

    if (cell.fillColor == null) {
      return Center(
        child: Text(
          '${cell.day}',
          style: TextStyle(
            color: cell.isCurrentMonth
                ? const Color(0xFF2B2B2B)
                : const Color(0xFFB1B1B7),
            fontSize: f(20),
            fontWeight: FontWeight.w400,
            fontFamily: 'Sans Serif',
          ),
        ),
      );
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(w(8)),
        onTap: cell.date == null
            ? null
            : () {
                setState(() {
                  _selectedDate = cell.date;
                });
              },
        child: Container(
          decoration: BoxDecoration(
            color: fillColor,
            borderRadius: BorderRadius.circular(w(8)),
          ),
          child: Center(
            child: Text(
              '${cell.day}',
              style: TextStyle(
                color: textColor,
                fontSize: f(20),
                fontWeight: FontWeight.w400,
                fontFamily: 'Sans Serif',
                height: 1,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSelectedDayDetailsCard(
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    final selected = _selectedDate!;
    final details = _attendanceDataForDate(selected);

    return Container(
      width: w(380),
      padding: EdgeInsets.symmetric(horizontal: w(16), vertical: h(12)),
      decoration: BoxDecoration(
        color: AppColors.bgWhite,
        borderRadius: BorderRadius.circular(w(12)),
        border: Border.all(color: const Color(0xFFDEDEDE), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${selected.day.toString().padLeft(2, '0')} ${_getMonthName(selected.month)} ${selected.year}',
            style: TextStyle(
              color: const Color(0xFF141414),
              fontSize: f(16),
              fontWeight: FontWeight.w600,
              fontFamily: 'Sans Serif',
            ),
          ),
          SizedBox(height: h(6)),
          Text(
            'Status: ${details.statusLabel}',
            style: TextStyle(
              color: const Color(0xFF808080),
              fontSize: f(14),
              fontWeight: FontWeight.w400,
              fontFamily: 'Sans Serif',
            ),
          ),
          Text(
            'Worked Hours: ${details.workedHours}',
            style: TextStyle(
              color: const Color(0xFF808080),
              fontSize: f(14),
              fontWeight: FontWeight.w400,
              fontFamily: 'Sans Serif',
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBreakdownCard({
    required double Function(double) w,
    required double Function(double) h,
    required double Function(double) f,
    required String title,
    required String amount,
    required Color iconBg,
    required Color cardBg,
    required Color borderColor,
  }) {
    return Container(
      width: w(380),
      height: h(98),
      padding: EdgeInsets.symmetric(horizontal: w(16), vertical: h(16)),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(w(16)),
        border: Border.all(color: borderColor, width: 1),
      ),
      child: Row(
        children: [
          _buildMoneyIconCircle(
            size: w(58),
            background: iconBg,
            iconColor: Colors.white,
          ),
          SizedBox(width: w(16)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  title,
                  textAlign: TextAlign.right,
                  textHeightBehavior: const TextHeightBehavior(
                    applyHeightToFirstAscent: false,
                    applyHeightToLastDescent: false,
                  ),
                  style: TextStyle(
                    color: const Color(0xFF808080),
                    fontSize: f(14),
                    fontStyle: FontStyle.normal,
                    fontWeight: FontWeight.w400,
                    fontFamily: 'Sans Serif',
                  ),
                ),
                SizedBox(height: h(12)),
                Text(
                  amount,
                  textAlign: TextAlign.right,
                  textHeightBehavior: const TextHeightBehavior(
                    applyHeightToFirstAscent: false,
                    applyHeightToLastDescent: false,
                  ),
                  style: TextStyle(
                    color: const Color(0xFF141414),
                    fontSize: f(30),
                    fontStyle: FontStyle.normal,
                    fontWeight: FontWeight.w600,
                    fontFamily: 'Sans Serif',
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMoneyIconCircle({
    required double size,
    required Color background,
    required Color iconColor,
  }) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: background, shape: BoxShape.circle),
      child: Icon(
        LucideIcons.handCoins,
        color: iconColor,
        size: size * 0.50,
      ),
    );
  }

  int _getDayOffset(DateTime dateTime) {
    return DateTime(dateTime.year, dateTime.month, 1).weekday - 1;
  }

  int _getDaysInMonth(int year, int month) {
    if (month == 12) {
      return DateTime(year + 1, 1, 0).day;
    } else {
      return DateTime(year, month + 1, 0).day;
    }
  }

  String _getMonthName(int month) {
    const months = [
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
      'December',
    ];
    return months[month - 1];
  }

  List<_CalendarCell> _buildCalendarCells() {
    final cells = <_CalendarCell>[];
    final offset = _getDayOffset(_currentMonth);
    final daysInMonth = _getDaysInMonth(
      _currentMonth.year,
      _currentMonth.month,
    );
    final prevMonthDate = DateTime(_currentMonth.year, _currentMonth.month, 0);
    final daysInPrevMonth = prevMonthDate.day;
    final cellCount = ((offset + daysInMonth) / 7).ceil() * 7;

    for (int i = 0; i < cellCount; i++) {
      if (i < offset) {
        final day = daysInPrevMonth - offset + i + 1;
        final monthDate = DateTime(
          _currentMonth.year,
          _currentMonth.month - 1,
          day,
        );
        cells.add(
          _CalendarCell(day: day, isCurrentMonth: false, date: monthDate),
        );
      } else if (i >= offset + daysInMonth) {
        final day = i - (offset + daysInMonth) + 1;
        final monthDate = DateTime(
          _currentMonth.year,
          _currentMonth.month + 1,
          day,
        );
        cells.add(
          _CalendarCell(day: day, isCurrentMonth: false, date: monthDate),
        );
      } else {
        final day = i - offset + 1;
        final monthDate = DateTime(
          _currentMonth.year,
          _currentMonth.month,
          day,
        );
        cells.add(_statusForDate(monthDate));
      }
    }

    return cells;
  }

  _CalendarCell _statusForDate(DateTime date) {
    const green = Color(0xFF1F9A36);
    const yellow = Color(0xFFF6B533);
    const red = Color(0xFFFF2D55);
    const lightBlue = Color(0xFFBCC8EC);

    final day = date.day;

    // Try to find a record for this date from fetched monthly summary
    try {
      AttendanceRecord? match;
      try {
        match = _days.firstWhere((d) => d.date.year == date.year && d.date.month == date.month && d.date.day == date.day);
      } catch (_) {
        match = null;
      }

      if (match != null) {
        final status = match.status.toLowerCase();
        if (status.contains('present') || status.contains('complete') || status.contains('checked-in')) {
          return _CalendarCell(day: day, isCurrentMonth: true, date: date, fillColor: green, textColor: Colors.white);
        }
        if (status.contains('leave') || status.contains('holiday')) {
          return _CalendarCell(day: day, isCurrentMonth: true, date: date, fillColor: yellow, textColor: Colors.white);
        }
        if (status.contains('absent')) {
          return _CalendarCell(day: day, isCurrentMonth: true, date: date, fillColor: red, textColor: Colors.white);
        }
      }
    } catch (_) {}

    return _CalendarCell(day: day, isCurrentMonth: true, date: date);
  }

  _AttendanceDayData _attendanceDataForDate(DateTime date) {
    AttendanceRecord? match;
    try {
      match = _days.firstWhere((d) => d.date.year == date.year && d.date.month == date.month && d.date.day == date.day);
    } catch (_) {
      match = null;
    }

    if (match != null) {
      final status = match.status ?? 'No Record';
      final hours = '${match.hoursWorked.toStringAsFixed(1)}h';
      return _AttendanceDayData(statusLabel: status, workedHours: hours);
    }

    return const _AttendanceDayData(statusLabel: 'No Record', workedHours: '0h 00m');
  }

  bool _isSameDay(DateTime a, DateTime b) {
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }

}

class _CalendarCell {
  final int day;
  final bool isCurrentMonth;
  final DateTime? date;
  final Color? fillColor;
  final Color textColor;

  _CalendarCell({
    required this.day,
    required this.isCurrentMonth,
    this.date,
    this.fillColor,
    this.textColor = const Color(0xFF2B2B2B),
  });
}

class _AttendanceDayData {
  final String statusLabel;
  final String workedHours;

  const _AttendanceDayData({
    required this.statusLabel,
    required this.workedHours,
  });
}