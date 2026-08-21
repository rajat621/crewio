// lib/presentation/pages/legal/legal_document_page.dart
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../config/theme/app_colors.dart';
import '../../../config/theme/app_text_styles.dart';

class LegalDocumentPage extends StatelessWidget {
  final String title;
  final String content;
  final String? version;
  final String? effectiveDate;

  const LegalDocumentPage({
    super.key,
    required this.title,
    required this.content,
    this.version,
    this.effectiveDate,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgPrimary,
      appBar: AppBar(
        backgroundColor: AppColors.bgWhite,
        elevation: 0,
        title: Text(title),
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(LucideIcons.chevronLeft),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (version != null || effectiveDate != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.bgWhite,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFE5E7EB)),
                  ),
                  child: Wrap(
                    spacing: 16,
                    runSpacing: 4,
                    children: [
                      if (version != null)
                        Text('Version $version',
                            style: AppTextStyles.bodySmall
                                .copyWith(color: AppColors.textGray)),
                      if (effectiveDate != null)
                        Text('Effective $effectiveDate',
                            style: AppTextStyles.bodySmall
                                .copyWith(color: AppColors.textGray)),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
              ],
              Text(
                content,
                style: AppTextStyles.bodyMedium.copyWith(height: 1.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
