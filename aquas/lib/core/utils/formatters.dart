// lib/core/utils/formatters.dart
//
// Centralized formatting helpers. Currency in this app is always AED
// (United Arab Emirates Dirham) - every screen that displays a monetary
// amount should go through formatAed() rather than building its own
// "AED ${amount.toStringAsFixed(2)}" string, so a currency change (or a
// formatting fix) only ever needs to happen in one place.
class Formatters {
  Formatters._();

  /// Formats [amount] as "AED 1,234.56". Pass [withSymbol]=false for just
  /// the comma-grouped number (e.g. inside a table cell that already has
  /// its own "AED" column header).
  static String formatAed(num? amount, {bool withSymbol = true}) {
    final value = (amount ?? 0).toDouble();
    final isNegative = value < 0;
    final raw = value.abs().toStringAsFixed(2);
    final parts = raw.split('.');
    final whole = parts[0].replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (match) => ',',
    );
    final formatted = '${isNegative ? '-' : ''}$whole.${parts[1]}';
    return withSymbol ? 'AED $formatted' : formatted;
  }
}
