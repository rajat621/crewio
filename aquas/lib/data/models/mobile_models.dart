class ChatMessageModel {
  final String id;
  final String from;
  final String to;
  final String text;
  final DateTime createdAt;
  final bool isMine;

  ChatMessageModel({
    required this.id,
    required this.from,
    required this.to,
    required this.text,
    required this.createdAt,
    required this.isMine,
  });

  factory ChatMessageModel.fromJson(Map<String, dynamic> json, String myId) {
    final from = json['from']?.toString() ?? '';
    return ChatMessageModel(
      id: json['_id']?.toString() ?? '',
      from: from,
      to: json['to']?.toString() ?? '',
      text: json['text']?.toString() ?? '',
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      isMine: from == myId,
    );
  }
}

class SalarySlipModel {
  final String id;
  final String month;
  final int year;
  final double baseSalary;
  final double allowances;
  final double deductions;
  final double netSalary;
  final String status;
  final int? slipNumber;

  SalarySlipModel({
    required this.id,
    required this.month,
    required this.year,
    required this.baseSalary,
    required this.allowances,
    required this.deductions,
    required this.netSalary,
    required this.status,
    this.slipNumber,
  });

  factory SalarySlipModel.fromJson(Map<String, dynamic> json) {
    return SalarySlipModel(
      id: json['_id']?.toString() ?? '',
      month: json['month']?.toString() ?? '',
      year: json['year'] as int? ?? DateTime.now().year,
      baseSalary: (json['baseSalary'] as num?)?.toDouble() ?? 0,
      allowances: (json['allowances'] as num?)?.toDouble() ?? 0,
      deductions: (json['deductions'] as num?)?.toDouble() ?? 0,
      netSalary: (json['netSalary'] as num?)?.toDouble() ?? 0,
      status: json['status']?.toString() ?? 'generated',
      slipNumber: json['slipNumber'] as int?,
    );
  }
}

class AdvanceEntry {
  final String slipId;
  final String month;
  final int year;
  final double amount;
  final String note;

  AdvanceEntry({
    required this.slipId,
    required this.month,
    required this.year,
    required this.amount,
    required this.note,
  });

  factory AdvanceEntry.fromJson(Map<String, dynamic> json) {
    return AdvanceEntry(
      slipId: json['slipId']?.toString() ?? '',
      month: json['month']?.toString() ?? '',
      year: json['year'] as int? ?? DateTime.now().year,
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      note: json['note']?.toString() ?? '',
    );
  }
}

class NotificationModel {
  final String id;
  final String title;
  final String body;
  final bool read;
  final DateTime createdAt;

  NotificationModel({
    required this.id,
    required this.title,
    required this.body,
    required this.read,
    required this.createdAt,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    return NotificationModel(
      id: json['_id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      read: json['read'] as bool? ?? false,
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
    );
  }
}
