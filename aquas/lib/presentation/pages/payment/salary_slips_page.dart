//lib/presentation/pages/payment/salary_slips_page.dart

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../config/theme/app_colors.dart';
import '../../../service_locator.dart';
import '../../../data/models/mobile_models.dart';

class SalarySlipsPage extends StatefulWidget {
  const SalarySlipsPage({super.key});

  @override
  State<SalarySlipsPage> createState() => _SalarySlipsPageState();
}

class _SalarySlipsPageState extends State<SalarySlipsPage> {
  late List<SalarySlipModel> _history;
  bool _loading = true;

  /// Opens the exact same PDF the dashboard generates, in the device's own
  /// external browser (not an in-app webview) - the download endpoint
  /// requires auth, and an external browser can't attach an Authorization
  /// header, so the access token is passed as a short-lived query param
  /// (see authenticateDualOrQueryToken on the backend, scoped only to this
  /// endpoint).
  Future<void> _openSlip(String slipId) async {
    try {
      final token = await ServiceLocator().tokenService.getAccessToken();
      final baseUrl = ServiceLocator().apiClient.baseUrl;
      final uri = Uri.parse('$baseUrl/api/salary-slips/$slipId/download').replace(
        queryParameters: {if (token != null) 'token': token},
      );

      final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!opened && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not open the salary slip.'),
            backgroundColor: AppColors.errorRed,
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not open the salary slip: $e'),
          backgroundColor: AppColors.errorRed,
        ),
      );
    }
  }

  @override
  void initState() {
    super.initState();
    _history = [];
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    try {
      final slips = await ServiceLocator().salaryService.getSalarySlips();
      if (mounted) setState(() {
        _history = slips;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
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

    final currentYear = DateTime.now().year;
    final groupedHistory = _groupByYearDesc(_history.map((s) => _SalarySlipData.fromModel(s)).toList());

    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      body: Column(
        children: [
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
                padding: EdgeInsets.fromLTRB(w(16), h(24), w(16), h(24)),
                child: Column(
  crossAxisAlignment: CrossAxisAlignment.start,
  children: [
                    for (int i = 0; i < groupedHistory.length; i++) ...[
                      _buildYearChip(
                        label: groupedHistory[i].key == currentYear
                            ? 'This year ${groupedHistory[i].key}'
                            : '${groupedHistory[i].key}',
                        w: w,
                        h: h,
                        f: f,
                      ),
                      SizedBox(height: h(14)),
                      for (final record in groupedHistory[i].value) ...[
                          _buildSalarySlipItem(
                            w: w,
                            h: h,
                            f: f,
                            id: record.id,
                            title: record.title,
                            amount: _formatRupee(record.amount),
                            date: _formatDate(record.date),
                          ),
                        SizedBox(height: h(12)),
                      ],
                      SizedBox(height: h(12)),
                    ],
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
      padding: EdgeInsets.fromLTRB(w(14), h(8), w(14), h(8)),
      decoration: const BoxDecoration(
        color: AppColors.bgWhite,
        border: Border(bottom: BorderSide(color: Color(0xFFD7D7D7), width: 1)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: Icon(
              LucideIcons.arrowLeft,
              size: w(26),
              color: const Color(0xFF1E1E1E),
            ),
            padding: EdgeInsets.zero,
            constraints: BoxConstraints.tightFor(width: w(36), height: w(36)),
          ),
          Expanded(
            child: Text(
              'Salary Slips',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: const Color(0xFF141414),
                fontSize: f(28),
                fontWeight: FontWeight.w500,
                fontFamily: 'Sans Serif',
              ),
            ),
          ),
          // Spacer to balance the back button so the title stays centered.
          SizedBox(width: w(36)),
        ],
      ),
    );
  }

Widget _buildYearChip({
  required String label,
  required double Function(double) w,
  required double Function(double) h,
  required double Function(double) f,
}) {
  return Align(
    alignment: Alignment.center,
    child: IntrinsicWidth(
      child: Container(
        height: h(24),
        padding: EdgeInsets.symmetric(horizontal: w(16)),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: const Color(0xFFDFE7FF),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,

          textHeightBehavior: const TextHeightBehavior(
            applyHeightToFirstAscent: false,
            applyHeightToLastDescent: false,
          ),

          strutStyle: const StrutStyle(
            forceStrutHeight: true,
            height: 1,
          ),

          style: TextStyle(
            color: const Color(0xFF141414),
            fontSize: f(14),
            fontWeight: FontWeight.w400,
            fontFamily: 'Sans Serif',
            height: 1,
          ),
        ),
      ),
    ),
  );
}

  Widget _buildSalarySlipItem({
  required double Function(double) w,
  required double Function(double) h,
  required double Function(double) f,
  required String id,
  required String title,
  required String amount,
  required String date,
}) {
  return InkWell(
    onTap: () => _openSlip(id),
    borderRadius: BorderRadius.circular(12),
    child: Container(
    width: w(380),
    height: h(68),

    padding: EdgeInsets.symmetric(horizontal: w(12)),

    decoration: BoxDecoration(
      color: AppColors.bgWhite,
      borderRadius: BorderRadius.circular(12),
      border: Border.all(
        color: const Color(0xFFDEDEDE),
        width: 1,
      ),
    ),

    child: Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [

        /// ICON
        Icon(
          LucideIcons.receiptText,
          size: w(34),
          color: const Color(0xFF2C59D8),
        ),

        SizedBox(width: w(12)),

        /// LEFT TEXTS
        Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [

              /// LABEL
              Text(
                title,

                textHeightBehavior: const TextHeightBehavior(
                  applyHeightToFirstAscent: false,
                  applyHeightToLastDescent: false,
                ),

                strutStyle: const StrutStyle(
                  forceStrutHeight: true,
                  height: 1,
                ),

                style: TextStyle(
                  color: const Color(0xFF808080),
                  fontSize: f(16),
                  fontWeight: FontWeight.w400,
                  fontFamily: 'Sans Serif',
                  height: 1,
                ),
              ),

              SizedBox(height: h(10)),

              /// AMOUNT
              Text(
                amount,

                textHeightBehavior: const TextHeightBehavior(
                  applyHeightToFirstAscent: false,
                  applyHeightToLastDescent: false,
                ),

                strutStyle: const StrutStyle(
                  forceStrutHeight: true,
                  height: 1,
                ),

                style: TextStyle(
                  color: const Color(0xFF141414),
                  fontSize: f(20),
                  fontWeight: FontWeight.w600,
                  fontFamily: 'Sans Serif',
                  height: 1,
                ),
              ),
            ],
          ),
        ),

        SizedBox(width: w(12)),

        /// DATE
        Text(
          date,
          textAlign: TextAlign.right,

          textHeightBehavior: const TextHeightBehavior(
            applyHeightToFirstAscent: false,
            applyHeightToLastDescent: false,
          ),

          strutStyle: const StrutStyle(
            forceStrutHeight: true,
            height: 1,
          ),

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
  ),
  );
}

  List<MapEntry<int, List<_SalarySlipData>>> _groupByYearDesc(
    List<_SalarySlipData> history,
  ) {
    final sorted = [...history]..sort((a, b) => b.date.compareTo(a.date));
    final grouped = <int, List<_SalarySlipData>>{};

    for (final item in sorted) {
      grouped.putIfAbsent(item.date.year, () => []);
      grouped[item.date.year]!.add(item);
    }

    final entries = grouped.entries.toList()
      ..sort((a, b) => b.key.compareTo(a.key));
    return entries;
  }

  String _formatRupee(double amount) {
    final raw = amount.toStringAsFixed(2);
    final parts = raw.split('.');
    final whole = parts[0].replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (match) => ',',
    );
    return '₹$whole.${parts[1]}';
  }

  String _formatDate(DateTime date) {
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
    final day = date.day.toString().padLeft(2, '0');
    return '$day ${months[date.month - 1]}';
  }
}

class _SalarySlipData {
  final String id;
  final String title;
  final double amount;
  final DateTime date;

  _SalarySlipData(this.id, this.title, this.amount, this.date);

  factory _SalarySlipData.fromModel(SalarySlipModel m) {
    final title = '${m.month} ${m.year}';
    final monthIndex = _monthIndex(m.month);
    return _SalarySlipData(m.id, title, m.netSalary, DateTime(m.year, monthIndex, 1));
  }

  static int _monthIndex(String month) {
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
    final idx = months.indexWhere((m) => m.toLowerCase() == month.toLowerCase());
    return idx >= 0 ? idx + 1 : 1;
  }
}