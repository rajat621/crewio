class AttendanceRecord {
  final String? id;
  final DateTime date;
  final String status;
  final String? checkIn;
  final String? checkOut;
  final double hoursWorked;

  AttendanceRecord({
    this.id,
    required this.date,
    required this.status,
    this.checkIn,
    this.checkOut,
    this.hoursWorked = 0,
  });

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceRecord(
      id: json['_id'] as String?,
      date: DateTime.tryParse(json['date']?.toString() ?? '') ?? DateTime.now(),
      status: json['status']?.toString() ?? 'absent',
      checkIn: json['checkIn'] as String?,
      checkOut: json['checkOut'] as String?,
      hoursWorked: (json['hoursWorked'] as num?)?.toDouble() ?? 0,
    );
  }

  bool get isCheckedInOnly => checkIn != null && checkOut == null;
  bool get isComplete => checkIn != null && checkOut != null;
}

class MonthlySummary {
  final int month;
  final int year;
  final int daysPresent;
  final double totalHours;
  final List<AttendanceRecord> days;

  MonthlySummary({
    required this.month,
    required this.year,
    required this.daysPresent,
    required this.totalHours,
    required this.days,
  });

  factory MonthlySummary.fromJson(Map<String, dynamic> json) {
    return MonthlySummary(
      month: json['month'] as int? ?? DateTime.now().month,
      year: json['year'] as int? ?? DateTime.now().year,
      daysPresent: json['daysPresent'] as int? ?? 0,
      totalHours: (json['totalHours'] as num?)?.toDouble() ?? 0,
      days: ((json['days'] as List?) ?? [])
          .map((e) => AttendanceRecord.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
