// // lib/presentation/pages/payment/view_advance_page.dart

// import 'package:flutter/material.dart';
// import 'package:lucide_icons_flutter/lucide_icons.dart';
// import '../../../config/theme/app_colors.dart';
// import '../../../service_locator.dart';
// import '../../../data/models/lifecycle_model.dart';

// class ViewAdvancePage extends StatefulWidget {
//   const ViewAdvancePage({super.key});

//   @override
//   State<ViewAdvancePage> createState() => _ViewAdvancePageState();
// }

// class _ViewAdvancePageState extends State<ViewAdvancePage> {
//   final _attendanceService = ServiceLocator().attendanceService;

//   bool _loading = true;
//   String? _error;
//   ExpenseSummary _summary = ExpenseSummary.empty();

//   @override
//   void initState() {
//     super.initState();
//     _loadSummary();
//   }

//   /// Loads live data straight from the same Employee.expenses.records store
//   /// the dashboard's Expense page reads/writes - so pulling to refresh here
//   /// always reflects whatever the office has most recently added/edited.
//   Future<void> _loadSummary() async {
//     setState(() {
//       _loading = true;
//       _error = null;
//     });
//     try {
//       final summary = await _attendanceService.getExpenseSummary();
//       if (!mounted) return;
//       setState(() {
//         _summary = summary;
//         _loading = false;
//       });
//     } catch (e) {
//       if (!mounted) return;
//       setState(() {
//         _error = e.toString();
//         _loading = false;
//       });
//     }
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
//               child: _loading
//                   ? const Center(child: CircularProgressIndicator())
//                   : RefreshIndicator(
//                       onRefresh: _loadSummary,
//                       child: SingleChildScrollView(
//                         physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
//                         padding: EdgeInsets.fromLTRB(w(16), h(24), w(16), h(24)),
//                         child: Column(
//                           crossAxisAlignment: CrossAxisAlignment.start,
//                           children: [
//                             if (_error != null)
//                               Padding(
//                                 padding: EdgeInsets.only(bottom: h(16)),
//                                 child: Text(
//                                   'Could not load your advance details: $_error',
//                                   style: TextStyle(color: AppColors.errorRed, fontSize: f(13)),
//                                 ),
//                               ),
//                             _buildRemainingCard(w, h, f),
//                             SizedBox(height: h(20)),
//                             if (_summary.paymentHistory.isEmpty)
//                               Padding(
//                                 padding: EdgeInsets.only(top: h(24)),
//                                 child: Center(
//                                   child: Text(
//                                     'No expense history yet.',
//                                     style: TextStyle(color: const Color(0xFF808080), fontSize: f(15)),
//                                   ),
//                                 ),
//                               )
//                             else
//                               for (final entry in _summary.paymentHistory) ...[
//                                 _buildLedgerItem(w: w, h: h, f: f, entry: entry),
//                                 SizedBox(height: h(12)),
//                               ],
//                           ],
//                         ),
//                       ),
//                     ),
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
//       padding: EdgeInsets.fromLTRB(w(14), h(8), w(14), h(8)),
//       decoration: const BoxDecoration(
//         color: AppColors.bgWhite,
//         border: Border(bottom: BorderSide(color: Color(0xFFD7D7D7), width: 1)),
//       ),
//       child: Row(
//         children: [
//           IconButton(
//             onPressed: () => Navigator.of(context).pop(),
//             icon: Icon(
//               LucideIcons.arrowLeft,
//               size: w(26),
//               color: const Color(0xFF1E1E1E),
//             ),
//             padding: EdgeInsets.zero,
//             constraints: BoxConstraints.tightFor(width: w(36), height: w(36)),
//           ),
//           Expanded(
//             child: Text(
//               'View Advance',
//               textAlign: TextAlign.center,
//               style: TextStyle(
//                 color: const Color(0xFF141414),
//                 fontSize: f(28),
//                 fontWeight: FontWeight.w500,
//                 fontFamily: 'Sans Serif',
//               ),
//             ),
//           ),
//           SizedBox(width: w(36)),
//         ],
//       ),
//     );
//   }

//   Widget _buildRemainingCard(
//     double Function(double) w,
//     double Function(double) h,
//     double Function(double) f,
//   ) {
//     return Container(
//       width: w(380),
//       padding: EdgeInsets.fromLTRB(w(16), h(20), w(16), h(20)),
//       decoration: BoxDecoration(
//         color: const Color(0xFFF0E5C8),
//         borderRadius: BorderRadius.circular(w(16)),
//         border: Border.all(color: const Color(0xFFECCF84), width: 1),
//       ),
//       child: Column(
//         crossAxisAlignment: CrossAxisAlignment.start,
//         children: [
//           Row(
//             crossAxisAlignment: CrossAxisAlignment.start,
//             children: [
//               Container(
//                 width: w(58),
//                 height: w(58),
//                 decoration: const BoxDecoration(
//                   color: Color(0xFFF7B933),
//                   shape: BoxShape.circle,
//                 ),
//                 child: Icon(
//                   LucideIcons.handCoins,
//                   color: Colors.white,
//                   size: w(28),
//                 ),
//               ),
//               SizedBox(width: w(16)),
//               Expanded(
//                 child: Column(
//                   crossAxisAlignment: CrossAxisAlignment.end,
//                   children: [
//                     Text(
//                       'Advance Payment Remain',
//                       textAlign: TextAlign.right,
//                       style: TextStyle(
//                         color: const Color(0xFF808080),
//                         fontSize: f(15),
//                         fontWeight: FontWeight.w400,
//                         fontFamily: 'Sans Serif',
//                       ),
//                     ),
//                     SizedBox(height: h(8)),
//                     RichText(
//                       textAlign: TextAlign.right,
//                       text: TextSpan(
//                         children: [
//                           TextSpan(
//                             text: 'AED  ',
//                             style: TextStyle(
//                               color: const Color(0xFF808080),
//                               fontSize: f(16),
//                               fontWeight: FontWeight.w400,
//                               fontFamily: 'Sans Serif',
//                             ),
//                           ),
//                           TextSpan(
//                             text: _summary.remainingAmount.toStringAsFixed(2),
//                             style: TextStyle(
//                               color: const Color(0xFF141414),
//                               fontSize: f(30),
//                               fontWeight: FontWeight.w600,
//                               fontFamily: 'Sans Serif',
//                             ),
//                           ),
//                         ],
//                       ),
//                     ),
//                   ],
//                 ),
//               ),
//             ],
//           ),
//           SizedBox(height: h(18)),
//           for (final line in [
//             MapEntry('Total Expense Amount', _summary.totalAdvance),
//             ..._summary.breakdown.entries,
//           ]) ...[
//             Padding(
//               padding: EdgeInsets.only(bottom: h(8)),
//               child: Row(
//                 mainAxisAlignment: MainAxisAlignment.spaceBetween,
//                 children: [
//                   Text(
//                     line.key,
//                     style: TextStyle(
//                       color: const Color(0xFF808080),
//                       fontSize: f(15),
//                       fontWeight: FontWeight.w400,
//                       fontFamily: 'Sans Serif',
//                     ),
//                   ),
//                   Text(
//                     'AED ${line.value.toStringAsFixed(0)}',
//                     style: TextStyle(
//                       color: const Color(0xFF141414),
//                       fontSize: f(16),
//                       fontWeight: FontWeight.w600,
//                       fontFamily: 'Sans Serif',
//                     ),
//                   ),
//                 ],
//               ),
//             ),
//           ],
//         ],
//       ),
//     );
//   }

//   // Human-friendly display name for the raw `type` string the backend
//   // sends (see normalizeExpenseType/TYPE_LABEL_MAP in
//   // mobilePayments.controller.js) - kept in sync with those exact category
//   // names so "Advance", "Gas", "Deduction" etc. read the same way here as
//   // they do in the dashboard's own Expense breakdown.
//   String _typeLabel(String type) {
//     switch (type.trim().toLowerCase()) {
//       case 'advance':
//         return 'Advance';
//       case 'gas':
//         return 'Gas';
//       case 'deduction':
//         return 'Deduction';
//       case 'other food':
//         return 'Other (Food)';
//       case 'other travel':
//         return 'Other (Travel)';
//       case 'other':
//         return 'Other';
//       default:
//         if (type.trim().isEmpty) return 'Expense';
//         return type[0].toUpperCase() + type.substring(1);
//     }
//   }

//   String _monthYear(DateTime date) {
//     const months = [
//       'January', 'February', 'March', 'April', 'May', 'June',
//       'July', 'August', 'September', 'October', 'November', 'December',
//     ];
//     return '${months[date.month - 1]} ${date.year}';
//   }

//   Widget _buildLedgerItem({
//     required double Function(double) w,
//     required double Function(double) h,
//     required double Function(double) f,
//     required ExpenseHistoryEntry entry,
//   }) {
//     final accent = entry.isDeduction
//         ? const Color(0xFFFF2D55)
//         : const Color(0xFF169C2E);

//     final typeLabel = _typeLabel(entry.type);
//     // The note/label is only worth a second line when it actually adds
//     // information beyond the type itself (e.g. a custom "other" note) -
//     // otherwise it's just the same word twice.
//     final showNote = entry.label.trim().isNotEmpty &&
//         entry.label.trim().toLowerCase() != typeLabel.toLowerCase() &&
//         entry.label.trim().toLowerCase() != entry.type.trim().toLowerCase();

//     return Container(
//       width: w(380),
//       constraints: BoxConstraints(minHeight: h(showNote ? 88 : 74)),
//       padding: EdgeInsets.symmetric(horizontal: w(12), vertical: h(12)),
//       decoration: BoxDecoration(
//         color: AppColors.bgWhite,
//         borderRadius: BorderRadius.circular(12),
//         border: Border.all(color: const Color(0xFFDEDEDE), width: 1),
//       ),
//       child: Row(
//         crossAxisAlignment: CrossAxisAlignment.center,
//         children: [
//           Icon(
//             entry.isDeduction ? LucideIcons.trendingDown : LucideIcons.trendingUp,
//             size: w(30),
//             color: accent,
//           ),
//           SizedBox(width: w(12)),
//           Expanded(
//             child: Column(
//               mainAxisAlignment: MainAxisAlignment.center,
//               crossAxisAlignment: CrossAxisAlignment.start,
//               mainAxisSize: MainAxisSize.min,
//               children: [
//                 Row(
//                   mainAxisAlignment: MainAxisAlignment.spaceBetween,
//                   children: [
//                     Text(
//                       typeLabel,
//                       style: TextStyle(
//                         color: const Color(0xFF141414),
//                         fontSize: f(15),
//                         fontWeight: FontWeight.w600,
//                         fontFamily: 'Sans Serif',
//                       ),
//                     ),
//                     Text(
//                       _monthYear(entry.date),
//                       style: TextStyle(
//                         color: const Color(0xFF808080),
//                         fontSize: f(13),
//                         fontWeight: FontWeight.w400,
//                         fontFamily: 'Sans Serif',
//                       ),
//                     ),
//                   ],
//                 ),
//                 if (showNote) ...[
//                   SizedBox(height: h(4)),
//                   Text(
//                     entry.label,
//                     style: TextStyle(
//                       color: const Color(0xFF808080),
//                       fontSize: f(13),
//                       fontWeight: FontWeight.w400,
//                       fontFamily: 'Sans Serif',
//                     ),
//                   ),
//                 ],
//                 SizedBox(height: h(8)),
//                 Text(
//                   'AED ${entry.amount.toStringAsFixed(2)}',
//                   style: TextStyle(
//                     color: const Color(0xFF141414),
//                     fontSize: f(20),
//                     fontWeight: FontWeight.w600,
//                     fontFamily: 'Sans Serif',
//                   ),
//                 ),
//               ],
//             ),
//           ),
//         ],
//       ),
//     );
//   }

//   String _formatDate(DateTime date) {
//     const months = [
//       'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
//       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
//     ];
//     final day = date.day.toString().padLeft(2, '0');
//     return '$day ${months[date.month - 1]} ${date.year}';
//   }
// }


// lib/presentation/pages/payment/view_advance_page.dart

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../config/theme/app_colors.dart';
import '../../../service_locator.dart';
import '../../../data/models/lifecycle_model.dart';

class ViewAdvancePage extends StatefulWidget {
  const ViewAdvancePage({super.key});

  @override
  State<ViewAdvancePage> createState() => _ViewAdvancePageState();
}

class _ViewAdvancePageState extends State<ViewAdvancePage> {
  final _attendanceService = ServiceLocator().attendanceService;

  bool _loading = true;
  String? _error;
  ExpenseSummary _summary = ExpenseSummary.empty();

  @override
  void initState() {
    super.initState();
    _loadSummary();
  }

  /// Loads live data straight from the same Employee.expenses.records store
  /// the dashboard's Expense page reads/writes - so pulling to refresh here
  /// always reflects whatever the office has most recently added/edited.
  Future<void> _loadSummary() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final summary = await _attendanceService.getExpenseSummary();
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
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
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : RefreshIndicator(
                      onRefresh: _loadSummary,
                      child: SingleChildScrollView(
                        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                        padding: EdgeInsets.fromLTRB(w(16), h(24), w(16), h(24)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (_error != null)
                              Padding(
                                padding: EdgeInsets.only(bottom: h(16)),
                                child: Text(
                                  'Could not load your advance details: $_error',
                                  style: TextStyle(color: AppColors.errorRed, fontSize: f(13)),
                                ),
                              ),
                            _buildRemainingCard(w, h, f),
                            SizedBox(height: h(20)),
                            if (_summary.paymentHistory.isEmpty)
                              Padding(
                                padding: EdgeInsets.only(top: h(24)),
                                child: Center(
                                  child: Text(
                                    'No expense history yet.',
                                    style: TextStyle(color: const Color(0xFF808080), fontSize: f(15)),
                                  ),
                                ),
                              )
                            else
                              for (final entry in _summary.paymentHistory) ...[
                                _buildLedgerItem(w: w, h: h, f: f, entry: entry),
                                SizedBox(height: h(12)),
                              ],
                          ],
                        ),
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
              'View Advance',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: const Color(0xFF141414),
                fontSize: f(28),
                fontWeight: FontWeight.w500,
                fontFamily: 'Sans Serif',
              ),
            ),
          ),
          SizedBox(width: w(36)),
        ],
      ),
    );
  }

  Widget _buildRemainingCard(
    double Function(double) w,
    double Function(double) h,
    double Function(double) f,
  ) {
    return Container(
      width: w(380),
      padding: EdgeInsets.fromLTRB(w(16), h(20), w(16), h(20)),
      decoration: BoxDecoration(
        color: const Color(0xFFF0E5C8),
        borderRadius: BorderRadius.circular(w(16)),
        border: Border.all(color: const Color(0xFFECCF84), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: w(48),
                height: w(48),
                decoration: const BoxDecoration(
                  color: Color(0xFFF7B933),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  LucideIcons.handCoins,
                  color: Colors.white,
                  size: w(24),
                ),
              ),
              SizedBox(width: w(12)),
              Text(
                'Advance Payment',
                style: TextStyle(
                  color: const Color(0xFF141414),
                  fontSize: f(17),
                  fontWeight: FontWeight.w500,
                  fontFamily: 'Sans Serif',
                ),
              ),
            ],
          ),
          SizedBox(height: h(18)),
          // Matches the dashboard's View Report / Expense Detail Panel
          // exactly: Total Expense Amount, then each category, then a
          // divider, then Remain Amount last (not a big hero number up
          // top) - same order, same labels, same information hierarchy.
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Total Expense Amount',
                style: TextStyle(
                  color: const Color(0xFF808080),
                  fontSize: f(13),
                  fontWeight: FontWeight.w400,
                  fontFamily: 'Sans Serif',
                ),
              ),
              Text(
                'AED ${_summary.totalAdvance.toStringAsFixed(2)}',
                style: TextStyle(
                  color: const Color(0xFF141414),
                  fontSize: f(16),
                  fontWeight: FontWeight.w700,
                  fontFamily: 'Sans Serif',
                ),
              ),
            ],
          ),
          SizedBox(height: h(12)),
          for (final line in _summary.breakdown.entries) ...[
            Padding(
              padding: EdgeInsets.only(bottom: h(8)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    line.key,
                    style: TextStyle(
                      color: const Color(0xFF808080),
                      fontSize: f(13),
                      fontWeight: FontWeight.w400,
                      fontFamily: 'Sans Serif',
                    ),
                  ),
                  Text(
                    'AED ${line.value.toStringAsFixed(2)}',
                    style: TextStyle(
                      color: const Color(0xFF141414),
                      fontSize: f(13),
                      fontWeight: FontWeight.w600,
                      fontFamily: 'Sans Serif',
                    ),
                  ),
                ],
              ),
            ),
          ],
          Padding(
            padding: EdgeInsets.symmetric(vertical: h(8)),
            child: Container(height: 1, color: const Color(0xFFECCF84)),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                'Remain Amount',
                style: TextStyle(
                  color: const Color(0xFF808080),
                  fontSize: f(13),
                  fontWeight: FontWeight.w400,
                  fontFamily: 'Sans Serif',
                ),
              ),
              RichText(
                text: TextSpan(
                  children: [
                    TextSpan(
                      text: 'AED  ',
                      style: TextStyle(
                        color: const Color(0xFF808080),
                        fontSize: f(16),
                        fontWeight: FontWeight.w400,
                        fontFamily: 'Sans Serif',
                      ),
                    ),
                    TextSpan(
                      text: _summary.remainingAmount.toStringAsFixed(2),
                      style: TextStyle(
                        color: const Color(0xFF141414),
                        fontSize: f(26),
                        fontWeight: FontWeight.w700,
                        fontFamily: 'Sans Serif',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // Human-friendly display name for the raw `type` string the backend
  // sends (see normalizeExpenseType/TYPE_LABEL_MAP in
  // mobilePayments.controller.js) - kept in sync with those exact category
  // names so "Advance", "Gas", "Deduction" etc. read the same way here as
  // they do in the dashboard's own Expense breakdown. Note: the backend
  // normalizes every deduction variant (gas/food/travel/penalty/advance/
  // other deduction) down to the single "deduction" bucket before this
  // ever sees it, so "Deduction" below is what actually renders for all of
  // them - the specific category still shows via the note/label line.
  String _typeLabel(String type) {
    switch (type.trim().toLowerCase()) {
      case 'advance':
        return 'Advance';
      case 'gas':
        return 'Gas';
      case 'deduction':
        return 'Deduction';
      case 'other food':
        return 'Other (Food)';
      case 'other travel':
        return 'Other (Travel)';
      case 'other':
        return 'Other';
      default:
        if (type.trim().isEmpty) return 'Expense';
        return type[0].toUpperCase() + type.substring(1);
    }
  }

  String _monthYear(DateTime date) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return '${months[date.month - 1]} ${date.year}';
  }

  Widget _buildLedgerItem({
    required double Function(double) w,
    required double Function(double) h,
    required double Function(double) f,
    required ExpenseHistoryEntry entry,
  }) {
    final accent = entry.isDeduction
        ? const Color(0xFFB4232F)
        : const Color(0xFF157347);

    final typeLabel = _typeLabel(entry.type);
    // The note/label is only worth a second line when it actually adds
    // information beyond the type itself (e.g. a custom "other" note) -
    // otherwise it's just the same word twice.
    final showNote = entry.label.trim().isNotEmpty &&
        entry.label.trim().toLowerCase() != typeLabel.toLowerCase() &&
        entry.label.trim().toLowerCase() != entry.type.trim().toLowerCase();

    return Container(
      width: w(380),
      constraints: BoxConstraints(minHeight: h(showNote ? 88 : 74)),
      padding: EdgeInsets.symmetric(horizontal: w(12), vertical: h(12)),
      decoration: BoxDecoration(
        color: AppColors.bgWhite,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFDEDEDE), width: 1),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Icon(
            entry.isDeduction ? LucideIcons.trendingDown : LucideIcons.trendingUp,
            size: w(30),
            color: accent,
          ),
          SizedBox(width: w(12)),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      typeLabel,
                      style: TextStyle(
                        color: accent,
                        fontSize: f(15),
                        fontWeight: FontWeight.w600,
                        fontFamily: 'Sans Serif',
                      ),
                    ),
                    Text(
                      _monthYear(entry.date),
                      style: TextStyle(
                        color: const Color(0xFF808080),
                        fontSize: f(13),
                        fontWeight: FontWeight.w400,
                        fontFamily: 'Sans Serif',
                      ),
                    ),
                  ],
                ),
                if (showNote) ...[
                  SizedBox(height: h(4)),
                  Text(
                    entry.label,
                    style: TextStyle(
                      color: const Color(0xFF808080),
                      fontSize: f(13),
                      fontWeight: FontWeight.w400,
                      fontFamily: 'Sans Serif',
                    ),
                  ),
                ],
                SizedBox(height: h(8)),
                Text(
                  'AED ${entry.amount.toStringAsFixed(2)}',
                  style: TextStyle(
                    color: accent,
                    fontSize: f(20),
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

  String _formatDate(DateTime date) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    final day = date.day.toString().padLeft(2, '0');
    return '$day ${months[date.month - 1]} ${date.year}';
  }
}