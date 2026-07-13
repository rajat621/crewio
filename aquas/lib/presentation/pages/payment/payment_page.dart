// // lib/presentation/pages/payment/payment_page.dart

// // ignore_for_file: unused_element

// import 'package:flutter/material.dart';
// import 'package:lucide_icons_flutter/lucide_icons.dart';
// import '../../../config/theme/app_colors.dart';
// import '../../../service_locator.dart';
// import '../../../data/models/mobile_models.dart';

// class PaymentPage extends StatefulWidget {
//   const PaymentPage({super.key});

//   @override
//   State<PaymentPage> createState() => _PaymentPageState();
// }

// class _PaymentPageState extends State<PaymentPage> {
//   double _totalEarnings = 0.0;
//   double _advanceTotal = 0.0;
//   double _fineTotal = 0.0;
//   bool _loading = true;

//   @override
//   void initState() {
//     super.initState();
//     _loadPaymentData();
//   }

//   Future<double> _fetchAdvanceTotal() async {
//     try {
//       final adv = await ServiceLocator().salaryService.getAdvances();
//       return adv.total;
//     } catch (_) {
//       return 0.0;
//     }
//   }

//   Future<double> _fetchFineTotal() async {
//     try {
//       final summary = await ServiceLocator().attendanceService.getExpenseSummary();
//       return summary.deduction;
//     } catch (_) {
//       return 0.0;
//     }
//   }

//   Future<double> _fetchTotalEarnings() async {
//     try {
//       final slips = await ServiceLocator().salaryService.getSalarySlips();
//       if (slips.isEmpty) return 0.0;

//       final now = DateTime.now();
//       int? parseMonth(String m) {
//         final trimmed = m.trim();
//         final n = int.tryParse(trimmed);
//         if (n != null && n >= 1 && n <= 12) return n;
//         const names = [
//           '',
//           'January',
//           'February',
//           'March',
//           'April',
//           'May',
//           'June',
//           'July',
//           'August',
//           'September',
//           'October',
//           'November',
//           'December'
//         ];
//         for (var i = 1; i <= 12; i++) {
//           if (trimmed.toLowerCase() == names[i].toLowerCase() ||
//               trimmed.toLowerCase().startsWith(names[i].toLowerCase().substring(0, 3))) {
//             return i;
//           }
//         }
//         return null;
//       }

//       final matched = slips.where((s) {
//         final mIdx = parseMonth(s.month);
//         return mIdx != null && mIdx == now.month && s.year == now.year;
//       }).toList();

//       if (matched.isNotEmpty) {
//         return matched.map((s) => s.netSalary).fold<double>(0.0, (a, b) => a + b);
//       }
//       return slips.take(3).map((s) => s.netSalary).fold<double>(0.0, (a, b) => a + b);
//     } catch (_) {
//       return 0.0;
//     }
//   }

//   Future<void> _loadPaymentData() async {
//     try {
//       // These three are fully independent - fetch them all at once instead
//       // of one after another so this screen loads roughly 3x faster.
//       final results = await Future.wait([
//         _fetchAdvanceTotal(),
//         _fetchTotalEarnings(),
//         _fetchFineTotal(),
//       ]);
//       _advanceTotal = results[0];
//       _totalEarnings = results[1];
//       _fineTotal = results[2];
//     } finally {
//       if (mounted) setState(() => _loading = false);
//     }
//   }

//   String _format(double v) => v.toStringAsFixed(2);

//   String _monthName(int m) {
//     const names = [
//       '',
//       'January',
//       'February',
//       'March',
//       'April',
//       'May',
//       'June',
//       'July',
//       'August',
//       'September',
//       'October',
//       'November',
//       'December'
//     ];
//     return (m >= 1 && m <= 12) ? names[m] : '';
//   }
//   @override
//   Widget build(BuildContext context) {
//     final mq = MediaQuery.of(context);
//     final sw = mq.size.width;
//     final sh = mq.size.height;
//     const baseW = 412.0;
//     const baseH = 917.0;
//     final sx = sw / baseW;
//     final sy = sh / baseH;
//     final sf = sx < sy ? sx : sy;

//     double w(double v) => v * sx;
//     double h(double v) => v * sy;
//     double f(double v) => v * sf;

//     return Scaffold(
//       backgroundColor: AppColors.bgPrimary,
//       body: Column(
//         children: [
//           // White wrapper so the status bar area renders white on every
//           // device, matching the rest of the app.
//           Container(
//             width: double.infinity,
//             color: AppColors.bgWhite,
//             child: SafeArea(
//               bottom: false,
//               child: _buildHeader(context, w, h, f),
//             ),
//           ),
//           Expanded(
//             child: SafeArea(
//               top: false,
//               child: SingleChildScrollView(
//                 physics: const BouncingScrollPhysics(),
//                 padding: EdgeInsets.fromLTRB(w(16), h(24), w(16), h(24)),
//                 child: Column(
//                   children: [
//                     _buildTopEarningsCard(w, h, f),
//                     SizedBox(height: h(18)),
//                     _buildSalarySlipsButton(w, h, f),
//                     SizedBox(height: h(24)),
//                     Container(
//                       width: w(380),
//                       height: 1,
//                       color: const Color(0xFFCCCCD1),
//                     ),
//                     SizedBox(height: h(24)),
//                     // _buildBreakdownCard(
//                     //   w: w,
//                     //   h: h,
//                     //   f: f,
//                     //   title: 'Last Month Earnings',
//                     //   amount: _loading ? '—' : _format(_totalEarnings),
//                     //   icon: LucideIcons.handCoins,
//                     //   iconBg: const Color(0xFF169C2E),
//                     //   cardBg: const Color(0xFFD1E0D6),
//                     //   borderColor: const Color(0xFF8CC8A0),
//                     // ),
//                     // SizedBox(height: h(14)),
//                     _buildBreakdownCard(
//                       w: w,
//                       h: h,
//                       f: f,
//                       title: 'Advance Payment',
//                       amount: _loading ? '—' : _format(_advanceTotal),
//                       icon: LucideIcons.handCoins,
//                       iconBg: const Color(0xFFF7B933),
//                       cardBg: const Color(0xFFF0E5C8),
//                       borderColor: const Color(0xFFECCF84),
//                       cardHeight: h(186),
//                       showViewButton: true,
//                       viewButtonLabel: 'View Detail',
//                       onViewPressed: () =>
//                           Navigator.of(context).pushNamed('/view-advance'),
//                     ),
//                     SizedBox(height: h(14)),
//                     _buildBreakdownCard(
//                       w: w,
//                       h: h,
//                       f: f,
//                       title: 'Fine',
//                       amount: _loading ? '—' : _format(_fineTotal),
//                       icon: LucideIcons.handCoins,
//                       iconBg: const Color(0xFFFF2D55),
//                       cardBg: const Color(0xFFEFC2CD),
//                       borderColor: const Color(0xFFF1A2B5),
//                     ),
//                   ],
//                 ),
//               ),
//             ),
//           ),
//         ],
//       ),
//     );
//   }

//   Widget _buildHeader(
//     BuildContext context,
//     double Function(double) w,
//     double Function(double) h,
//     double Function(double) f,
//   ) {
//     return Container(
//       height: h(68),
//       width: double.infinity,
//       padding: EdgeInsets.fromLTRB(w(16), h(8), w(16), h(8)),
//       decoration: const BoxDecoration(
//         color: AppColors.bgWhite,
//         border: Border(bottom: BorderSide(color: Color(0xFFD7D7D7), width: 1)),
//       ),
//       child: Row(
//         children: [
//           Material(
//             color: Colors.transparent,
//             shape: const CircleBorder(),
//             child: InkWell(
//               customBorder: const CircleBorder(),
//               onTap: () => Navigator.of(context).pushNamed('/profile'),
//               child: Container(
//                 width: w(44),
//                 height: w(44),
//                 decoration: const BoxDecoration(
//                   color: Color(0xFFDDDDE3),
//                   shape: BoxShape.circle,
//                 ),
//                 child: Icon(
//                   LucideIcons.user,
//                   size: w(26),
//                   color: const Color(0xFF8C8C96),
//                 ),
//               ),
//             ),
//           ),
//           SizedBox(width: w(10)),
//           Expanded(
//             child: Text(
//               'Payment',
//               textAlign: TextAlign.center,
//               style: TextStyle(
//                 color: const Color(0xFF141414),
//                 fontSize: f(24),
//                 fontWeight: FontWeight.w500,
//                 fontFamily: 'Sans Serif',
//               ),
//             ),
//           ),
//           IconButton(
//             onPressed: () => Navigator.of(context).pushNamed('/notifications'),
//             icon: Icon(
//               LucideIcons.bell,
//               size: w(24),
//               color: const Color(0xFF818181),
//             ),
//             padding: EdgeInsets.zero,
//             constraints: BoxConstraints.tightFor(width: w(34), height: w(34)),
//           ),
//         ],
//       ),
//     );
//   }

//   Widget _buildTopEarningsCard(
//     double Function(double) w,
//     double Function(double) h,
//     double Function(double) f,
//   ) {
//     return Container(
//       width: w(380),
//       height: 158,
//       padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
//       decoration: BoxDecoration(
//         color: AppColors.bgWhite,
//         borderRadius: BorderRadius.circular(12),
//         border: Border.all(color: const Color(0xFFDEDEDE), width: 1),
//         boxShadow: const [
//           BoxShadow(
//             color: Color.fromRGBO(95, 95, 111, 0.10),
//             blurRadius: 2,
//             offset: Offset(0, 0),
//           ),
//         ],
//       ),
//       child: Column(
//         crossAxisAlignment: CrossAxisAlignment.start,
//         children: [
//           // Icon + date row
//           Row(
//             children: [
//               Container(
//                 width: 44,
//                 height: 44,
//                 decoration: const BoxDecoration(
//                   color: Color(0xFFDDE5FC),
//                   shape: BoxShape.circle,
//                 ),
//                 child: Center(
//                   child: Icon(
//                     LucideIcons.handCoins,
//                     size: 22,
//                     color: const Color(0xFF2C59D8),
//                   ),
//                 ),
//               ),
//               const Spacer(),
//               Text(
//                 _monthName(DateTime.now().month),
//                 textHeightBehavior: const TextHeightBehavior(
//                   applyHeightToFirstAscent: false,
//                   applyHeightToLastDescent: false,
//                 ),
//                 strutStyle: const StrutStyle(forceStrutHeight: true, height: 1.0),
//                 style: TextStyle(
//                   color: const Color(0xFF969696),
//                   fontSize: f(18),
//                   fontStyle: FontStyle.italic,
//                   fontWeight: FontWeight.w400,
//                   fontFamily: 'Sans Serif',
//                   height: 1.0,
//                 ),
//               ),
//             ],
//           ),
//           const SizedBox(height: 12),
//           // Title
//           Text(
//             'Total Earnings',
//             textHeightBehavior: const TextHeightBehavior(
//               applyHeightToFirstAscent: false,
//               applyHeightToLastDescent: false,
//             ),
//             strutStyle: const StrutStyle(forceStrutHeight: true, height: 1.0),
//             style: TextStyle(
//               color: const Color(0xFF808080),
//               fontSize: f(16),
//               fontWeight: FontWeight.w400,
//               fontFamily: 'Sans Serif',
//               height: 26 / 16,
//             ),
//           ),
//           const SizedBox(height: 8),
//           // Amount
//           RichText(
//             textHeightBehavior: const TextHeightBehavior(
//               applyHeightToFirstAscent: false,
//               applyHeightToLastDescent: false,
//             ),
//             text: TextSpan(
//               children: [
//                 TextSpan(
//                   text: 'AED  ',
//                   style: TextStyle(
//                     color: const Color(0xFF808080),
//                     fontSize: f(18),
//                     fontWeight: FontWeight.w400,
//                     fontFamily: 'Sans Serif',
//                     height: 1.0,
//                   ),
//                 ),
//                 TextSpan(
//                   text: _loading ? '—' : _format(_totalEarnings),
//                   style: TextStyle(
//                     color: const Color(0xFF141414),
//                     fontSize: f(32),
//                     fontWeight: FontWeight.w500,
//                     fontFamily: 'Sans Serif',
//                     height: 1.0,
//                   ),
//                 ),
//               ],
//             ),
//           ),
//         ],
//       ),
//     );
//   }

//   Widget _buildSalarySlipsButton(
//     double Function(double) w,
//     double Function(double) h,
//     double Function(double) f,
//   ) {
//     return SizedBox(
//       width: w(380),
//       height: h(56),
//       child: DecoratedBox(
//         decoration: BoxDecoration(
//           color: const Color(0xFF2C57D3),
//           borderRadius: BorderRadius.circular(w(12)),
//         ),
//         child: Material(
//           color: Colors.transparent,
//           child: InkWell(
//             borderRadius: BorderRadius.circular(w(12)),
//             onTap: () => Navigator.of(context).pushNamed('/salary-slips'),
//             child: Row(
//               mainAxisAlignment: MainAxisAlignment.center,
//               children: [
//                 Icon(
//                   LucideIcons.receiptText,
//                   color: Colors.white,
//                   size: w(24),
//                 ),
//                 SizedBox(width: w(10)),
//                 Text(
//                   'View Salary Slips',
//                   style: TextStyle(
//                     color: Colors.white,
//                     fontSize: f(23),
//                     fontWeight: FontWeight.w400,
//                     fontFamily: 'Sans Serif',
//                   ),
//                 ),
//               ],
//             ),
//           ),
//         ),
//       ),
//     );
//   }

//   Widget _buildBreakdownCard({
//   required double Function(double) w,
//   required double Function(double) h,
//   required double Function(double) f,
//   required String title,
//   required String amount,
//   required IconData icon,
//   required Color iconBg,
//   required Color cardBg,
//   required Color borderColor,
//   double? cardHeight,
//   bool showViewButton = false,
//   String viewButtonLabel = 'View',
//   VoidCallback? onViewPressed,
// }) {
//   return Container(
//     width: w(380),
//     height: cardHeight ?? h(98),
//     padding: EdgeInsets.symmetric(
//       horizontal: w(16),
//       vertical: h(16),
//     ),
//     decoration: BoxDecoration(
//       color: cardBg,
//       borderRadius: BorderRadius.circular(w(16)),
//       border: Border.all(color: borderColor, width: 1),
//     ),
//     child: Column(
//       children: [
//         Row(
//           crossAxisAlignment: CrossAxisAlignment.start,
//           children: [
//             _buildIconCircle(
//               size: w(58),
//               background: iconBg,
//               icon: icon,
//               iconColor: Colors.white,
//             ),
//             SizedBox(width: w(16)),
//             Expanded(
//               child: Column(
//                 crossAxisAlignment: CrossAxisAlignment.end,
//                 children: [
//                   Text(
//                     title,
//                     textAlign: TextAlign.right,
//                     style: TextStyle(
//                       color: const Color(0xFF808080),
//                       fontSize: f(14),
//                       fontWeight: FontWeight.w400,
//                       fontFamily: 'Sans Serif',
//                     ),
//                   ),
//                   SizedBox(height: h(12)),
//                   RichText(
//                     textAlign: TextAlign.right,
//                     text: TextSpan(
//                       children: [
//                         TextSpan(
//                           text: 'AED  ',
//                           style: TextStyle(
//                             color: const Color(0xFF808080),
//                             fontSize: f(14),
//                             fontWeight: FontWeight.w400,
//                             fontFamily: 'Sans Serif',
//                           ),
//                         ),
//                         TextSpan(
//                           text: amount,
//                           style: TextStyle(
//                             color: const Color(0xFF141414),
//                             fontSize: f(30),
//                             fontWeight: FontWeight.w600,
//                             fontFamily: 'Sans Serif',
//                           ),
//                         ),
//                       ],
//                     ),
//                   ),
//                 ],
//               ),
//             ),
//           ],
//         ),

//         if (showViewButton) ...[
//           SizedBox(height: h(24)),

//           SizedBox(
//             width: double.infinity,
//             height: h(56),
//             child: DecoratedBox(
//               decoration: BoxDecoration(
//                 borderRadius: BorderRadius.circular(w(12)),
//                 border: Border.all(
//                   color: const Color(0xFF2C57D3),
//                   width: 1.5,
//                 ),
//               ),
//               child: Material(
//                 color: Colors.transparent,
//                 child: InkWell(
//                   borderRadius: BorderRadius.circular(w(12)),
//                   onTap: onViewPressed,
//                   child: Row(
//                     mainAxisAlignment: MainAxisAlignment.center,
//                     children: [
//                       Icon(
//                         LucideIcons.receiptText,
//                         color: const Color(0xFF2C57D3),
//                         size: w(20),
//                       ),
//                       SizedBox(width: w(8)),
//                       Text(
//                         viewButtonLabel,
//                         style: TextStyle(
//                           color: const Color(0xFF2C57D3),
//                           fontSize: f(18),
//                           fontWeight: FontWeight.w400,
//                           fontFamily: 'Sans Serif',
//                         ),
//                       ),
//                     ],
//                   ),
//                 ),
//               ),
//             ),
//           ),
//         ],
//       ],
//     ),
//   );
// }

//   Widget _buildIconCircle({
//     required double size,
//     required Color background,
//     required IconData icon,
//     required Color iconColor,
//   }) {
//     return Container(
//       width: size,
//       height: size,
//       decoration: BoxDecoration(color: background, shape: BoxShape.circle),
//       child: Icon(icon, color: iconColor, size: size * 0.50),
//     );
//   }
// }
// lib/presentation/pages/payment/payment_page.dart

// ignore_for_file: unused_element

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../config/theme/app_colors.dart';
import '../../../service_locator.dart';
import '../../../data/models/mobile_models.dart';
import '../../../data/models/lifecycle_model.dart';

class PaymentPage extends StatefulWidget {
  const PaymentPage({super.key});

  @override
  State<PaymentPage> createState() => _PaymentPageState();
}

class _PaymentPageState extends State<PaymentPage> {
  double _totalEarnings = 0.0;
  double _advanceTotal = 0.0;
  double _fineTotal = 0.0;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadPaymentData();
  }

  // Was previously ServiceLocator().salaryService.getAdvances().total, which
  // only totals 'advance' deductions already attached to finalized salary
  // slips - a much narrower (and often smaller/stale) number than what
  // View Advance actually shows. View Advance reads the full running ledger
  // from Employee.expenses.records via getExpenseSummary(), so the card
  // here now matches it exactly - "all the advance[s] together", the same
  // total you see the moment you tap View Detail.
  Future<double> _fetchAdvanceTotal() async {
    try {
      final summary = await ServiceLocator().attendanceService.getExpenseSummary();
      return summary.remainingAmount;
    } catch (_) {
      return 0.0;
    }
  }

  Future<double> _fetchFineTotal() async {
    try {
      final summary = await ServiceLocator().attendanceService.getExpenseSummary();
      return summary.deduction;
    } catch (_) {
      return 0.0;
    }
  }

  Future<double> _fetchTotalEarnings() async {
    try {
      final slips = await ServiceLocator().salaryService.getSalarySlips();
      if (slips.isEmpty) return 0.0;

      final now = DateTime.now();
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

      // Only ever show the CURRENT month's earning here. Previously, if no
      // slip existed yet for the current month (the normal case early in a
      // new month - e.g. a July slip typically isn't generated until July
      // ends), this fell back to the most recent past slip's amount
      // (usually just June's), which is exactly the "shows last month
      // instead of this month" bug being reported. If nothing has been
      // generated for this month yet, the correct value is 0 - not an old
      // month's number.
      if (matched.isNotEmpty) {
        return matched.map((s) => s.netSalary).fold<double>(0.0, (a, b) => a + b);
      }
      return 0.0;
    } catch (_) {
      return 0.0;
    }
  }

  Future<void> _loadPaymentData() async {
    try {
      // Advance and Fine both come from the same expense-ledger summary
      // (Employee.expenses.records) - fetch it once and derive both from
      // it, alongside the independent total-earnings call, rather than
      // hitting the same endpoint twice.
      final results = await Future.wait([
        ServiceLocator().attendanceService.getExpenseSummary(),
        _fetchTotalEarnings(),
      ]);
      final summary = results[0] as ExpenseSummary;
      _advanceTotal = summary.remainingAmount;
      _fineTotal = summary.deduction;
      _totalEarnings = results[1] as double;
    } catch (_) {
      // Fall back to independent per-card fetches (each already has its
      // own try/catch and defaults to 0.0) so a single failure here still
      // leaves the rest of the screen populated.
      final results = await Future.wait([
        _fetchAdvanceTotal(),
        _fetchTotalEarnings(),
        _fetchFineTotal(),
      ]);
      _advanceTotal = results[0];
      _totalEarnings = results[1];
      _fineTotal = results[2];
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _format(double v) => v.toStringAsFixed(2);

  String _monthName(int m) {
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
    return (m >= 1 && m <= 12) ? names[m] : '';
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
                padding: EdgeInsets.fromLTRB(w(16), h(24), w(16), h(24)),
                child: Column(
                  children: [
                    _buildTopEarningsCard(w, h, f),
                    SizedBox(height: h(18)),
                    _buildSalarySlipsButton(w, h, f),
                    SizedBox(height: h(24)),
                    Container(
                      width: w(380),
                      height: 1,
                      color: const Color(0xFFCCCCD1),
                    ),
                    SizedBox(height: h(24)),
                    // _buildBreakdownCard(
                    //   w: w,
                    //   h: h,
                    //   f: f,
                    //   title: 'Last Month Earnings',
                    //   amount: _loading ? '—' : _format(_totalEarnings),
                    //   icon: LucideIcons.handCoins,
                    //   iconBg: const Color(0xFF169C2E),
                    //   cardBg: const Color(0xFFD1E0D6),
                    //   borderColor: const Color(0xFF8CC8A0),
                    // ),
                    // SizedBox(height: h(14)),
                    _buildBreakdownCard(
                      w: w,
                      h: h,
                      f: f,
                      title: 'Advance Payment',
                      amount: _loading ? '—' : _format(_advanceTotal),
                      icon: LucideIcons.handCoins,
                      iconBg: const Color(0xFFF7B933),
                      cardBg: const Color(0xFFF0E5C8),
                      borderColor: const Color(0xFFECCF84),
                      cardHeight: h(186),
                      showViewButton: true,
                      viewButtonLabel: 'View Detail',
                      onViewPressed: () =>
                          Navigator.of(context).pushNamed('/view-advance'),
                    ),
                    SizedBox(height: h(14)),
                    // Fine card hidden per request - keeping the fetch
                    // logic (_fetchFineTotal/_fineTotal) intact in case
                    // this comes back later.
                    // _buildBreakdownCard(
                    //   w: w,
                    //   h: h,
                    //   f: f,
                    //   title: 'Fine',
                    //   amount: _loading ? '—' : _format(_fineTotal),
                    //   icon: LucideIcons.handCoins,
                    //   iconBg: const Color(0xFFFF2D55),
                    //   cardBg: const Color(0xFFEFC2CD),
                    //   borderColor: const Color(0xFFF1A2B5),
                    // ),
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
              'Payment',
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

  Widget _buildTopEarningsCard(
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
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
          // Icon + date row
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: const BoxDecoration(
                  color: Color(0xFFDDE5FC),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Icon(
                    LucideIcons.handCoins,
                    size: 22,
                    color: const Color(0xFF2C59D8),
                  ),
                ),
              ),
              const Spacer(),
              Text(
                _monthName(DateTime.now().month),
                textHeightBehavior: const TextHeightBehavior(
                  applyHeightToFirstAscent: false,
                  applyHeightToLastDescent: false,
                ),
                strutStyle: const StrutStyle(forceStrutHeight: true, height: 1.0),
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
          const SizedBox(height: 12),
          // Title
          Text(
            'Total Earnings',
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
          const SizedBox(height: 8),
          // Amount
          RichText(
            textHeightBehavior: const TextHeightBehavior(
              applyHeightToFirstAscent: false,
              applyHeightToLastDescent: false,
            ),
            text: TextSpan(
              children: [
                TextSpan(
                  text: 'AED  ',
                  style: TextStyle(
                    color: const Color(0xFF808080),
                    fontSize: f(18),
                    fontWeight: FontWeight.w400,
                    fontFamily: 'Sans Serif',
                    height: 1.0,
                  ),
                ),
                TextSpan(
                  text: _loading ? '—' : _format(_totalEarnings),
                  style: TextStyle(
                    color: const Color(0xFF141414),
                    fontSize: f(32),
                    fontWeight: FontWeight.w500,
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

  Widget _buildSalarySlipsButton(
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    return SizedBox(
      width: w(380),
      height: h(56),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: const Color(0xFF2C57D3),
          borderRadius: BorderRadius.circular(w(12)),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(w(12)),
            onTap: () => Navigator.of(context).pushNamed('/salary-slips'),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  LucideIcons.receiptText,
                  color: Colors.white,
                  size: w(24),
                ),
                SizedBox(width: w(10)),
                Text(
                  'View Salary Slips',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: f(23),
                    fontWeight: FontWeight.w400,
                    fontFamily: 'Sans Serif',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBreakdownCard({
  required double Function(double) w,
  required double Function(double) h,
  required double Function(double) f,
  required String title,
  required String amount,
  required IconData icon,
  required Color iconBg,
  required Color cardBg,
  required Color borderColor,
  double? cardHeight,
  bool showViewButton = false,
  String viewButtonLabel = 'View',
  VoidCallback? onViewPressed,
}) {
  return Container(
    width: w(380),
    height: cardHeight ?? h(98),
    padding: EdgeInsets.symmetric(
      horizontal: w(16),
      vertical: h(16),
    ),
    decoration: BoxDecoration(
      color: cardBg,
      borderRadius: BorderRadius.circular(w(16)),
      border: Border.all(color: borderColor, width: 1),
    ),
    child: Column(
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildIconCircle(
              size: w(58),
              background: iconBg,
              icon: icon,
              iconColor: Colors.white,
            ),
            SizedBox(width: w(16)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    title,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      color: const Color(0xFF808080),
                      fontSize: f(14),
                      fontWeight: FontWeight.w400,
                      fontFamily: 'Sans Serif',
                    ),
                  ),
                  SizedBox(height: h(12)),
                  RichText(
                    textAlign: TextAlign.right,
                    text: TextSpan(
                      children: [
                        TextSpan(
                          text: 'AED  ',
                          style: TextStyle(
                            color: const Color(0xFF808080),
                            fontSize: f(14),
                            fontWeight: FontWeight.w400,
                            fontFamily: 'Sans Serif',
                          ),
                        ),
                        TextSpan(
                          text: amount,
                          style: TextStyle(
                            color: const Color(0xFF141414),
                            fontSize: f(30),
                            fontWeight: FontWeight.w600,
                            fontFamily: 'Sans Serif',
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),

        if (showViewButton) ...[
          SizedBox(height: h(24)),

          SizedBox(
            width: double.infinity,
            height: h(56),
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(w(12)),
                border: Border.all(
                  color: const Color(0xFF2C57D3),
                  width: 1.5,
                ),
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(w(12)),
                  onTap: onViewPressed,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        LucideIcons.receiptText,
                        color: const Color(0xFF2C57D3),
                        size: w(20),
                      ),
                      SizedBox(width: w(8)),
                      Text(
                        viewButtonLabel,
                        style: TextStyle(
                          color: const Color(0xFF2C57D3),
                          fontSize: f(18),
                          fontWeight: FontWeight.w400,
                          fontFamily: 'Sans Serif',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    ),
  );
}

  Widget _buildIconCircle({
    required double size,
    required Color background,
    required IconData icon,
    required Color iconColor,
  }) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: background, shape: BoxShape.circle),
      child: Icon(icon, color: iconColor, size: size * 0.50),
    );
  }
}