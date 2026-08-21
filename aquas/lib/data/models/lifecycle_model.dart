/// Response shape shared by every lifecycle action endpoint
/// (check-in, start-work, stop-work, site-finished, leave start/end).
/// Kept intentionally small - each action only needs to tell the UI what
/// state it's now in, plus optionally the attendance record it touched.
class LifecycleResult {
  final String lifecycleState;
  final AttendanceRecordLite? attendance;
  final double? hoursWorked;

  LifecycleResult({required this.lifecycleState, this.attendance, this.hoursWorked});

  factory LifecycleResult.fromJson(Map<String, dynamic> json) {
    final attendanceJson = json['attendance'] as Map<String, dynamic>?;
    return LifecycleResult(
      lifecycleState: json['lifecycleState']?.toString() ?? 'WAITING_FOR_COMPANY',
      attendance: attendanceJson != null ? AttendanceRecordLite.fromJson(attendanceJson) : null,
      hoursWorked: (attendanceJson?['hoursWorked'] as num?)?.toDouble(),
    );
  }
}

class AttendanceRecordLite {
  final String? id;
  final String? checkIn;
  final String? checkOut;
  final double hoursWorked;

  AttendanceRecordLite({this.id, this.checkIn, this.checkOut, this.hoursWorked = 0});

  factory AttendanceRecordLite.fromJson(Map<String, dynamic> json) {
    return AttendanceRecordLite(
      id: json['_id']?.toString(),
      checkIn: json['checkIn']?.toString(),
      checkOut: json['checkOut']?.toString(),
      hoursWorked: (json['hoursWorked'] as num?)?.toDouble() ?? 0,
    );
  }
}

/// GET /api/mobile/expenses/summary - mirrors the dashboard's Expense page
/// exactly (same Employee.expenses.records source, same category rules), so
/// numbers here always match what the office sees.
class ExpenseSummary {
  final double totalAdvance;
  final double deduction;
  final double remainingAmount;
  final Map<String, double> breakdown; // display-ready label -> amount
  final List<ExpenseHistoryEntry> paymentHistory;

  ExpenseSummary({
    required this.totalAdvance,
    required this.deduction,
    required this.remainingAmount,
    required this.breakdown,
    required this.paymentHistory,
  });

  factory ExpenseSummary.fromJson(Map<String, dynamic> json) {
    final breakdownJson = json['breakdown'] as Map<String, dynamic>? ?? {};
    return ExpenseSummary(
      totalAdvance: (json['totalAdvance'] as num?)?.toDouble() ?? 0,
      deduction: (json['deduction'] as num?)?.toDouble() ?? 0,
      remainingAmount: (json['remainingAmount'] as num?)?.toDouble() ?? 0,
      breakdown: breakdownJson.map((k, v) => MapEntry(k, (v as num?)?.toDouble() ?? 0)),
      paymentHistory: ((json['paymentHistory'] as List?) ?? [])
          .map((e) => ExpenseHistoryEntry.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  static ExpenseSummary empty() => ExpenseSummary(
        totalAdvance: 0,
        deduction: 0,
        remainingAmount: 0,
        breakdown: const {},
        paymentHistory: const [],
      );
}

class ExpenseHistoryEntry {
  final String? id;
  final String type;
  final String label;
  final double amount;
  final DateTime date;
  final bool isDeduction;

  ExpenseHistoryEntry({
    this.id,
    required this.type,
    required this.label,
    required this.amount,
    required this.date,
    required this.isDeduction,
  });

  factory ExpenseHistoryEntry.fromJson(Map<String, dynamic> json) {
    return ExpenseHistoryEntry(
      id: json['id']?.toString(),
      type: json['type']?.toString() ?? 'other',
      label: json['label']?.toString() ?? 'Expense',
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      date: DateTime.tryParse(json['date']?.toString() ?? '') ?? DateTime.now(),
      isDeduction: json['isDeduction'] as bool? ?? false,
    );
  }
}

class AssignmentStatus {
  final String lifecycleState;
  final bool isAssigned;
  final Map<String, dynamic>? company;
  final bool isOnLeave;

  AssignmentStatus({
    required this.lifecycleState,
    required this.isAssigned,
    this.company,
    required this.isOnLeave,
  });

  factory AssignmentStatus.fromJson(Map<String, dynamic> json) {
    return AssignmentStatus(
      lifecycleState: json['lifecycleState']?.toString() ?? 'WAITING_FOR_COMPANY',
      isAssigned: json['isAssigned'] as bool? ?? false,
      company: json['company'] as Map<String, dynamic>?,
      isOnLeave: json['isOnLeave'] as bool? ?? false,
    );
  }
}
