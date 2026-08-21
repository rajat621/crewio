// lib/presentation/widgets/legal/legal_acceptance_checklist.dart
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../../config/theme/app_colors.dart';
import '../../../config/theme/app_text_styles.dart';
import '../../../core/legal/legal_documents.dart';
import '../../pages/legal/legal_document_page.dart';

/// The single mandatory checkbox + "I have read and agree to the ..."
/// sentence with every required legal document individually clickable,
/// as specified in section 1 of the legal-compliance requirements.
///
/// Used on the login screen (first acceptance) and on the forced
/// re-acceptance screen (when the backend publishes a newer legal
/// version) so both flows stay in sync automatically as documents are
/// added to [LegalDocuments.all].
class LegalAcceptanceChecklist extends StatefulWidget {
  final bool checked;
  final ValueChanged<bool> onChanged;
  /// When true, the checkbox itself can't be toggled (used for returning
  /// workers who already accepted the current version) but the document
  /// links remain tappable so they can still review any document anytime.
  final bool readOnly;

  const LegalAcceptanceChecklist({
    super.key,
    required this.checked,
    required this.onChanged,
    this.readOnly = false,
  });

  @override
  State<LegalAcceptanceChecklist> createState() => _LegalAcceptanceChecklistState();
}

class _LegalAcceptanceChecklistState extends State<LegalAcceptanceChecklist> {
  late final List<TapGestureRecognizer> _recognizers;

  @override
  void initState() {
    super.initState();
    _recognizers = LegalDocuments.all.map((doc) {
      final recognizer = TapGestureRecognizer();
      recognizer.onTap = () => _openDocument(doc);
      return recognizer;
    }).toList();
  }

  @override
  void dispose() {
    for (final recognizer in _recognizers) {
      recognizer.dispose();
    }
    super.dispose();
  }

  // Pushing a normal route (rather than replacing the current screen)
  // means whatever the worker had already typed into the Employee ID /
  // Password fields on the screen underneath is untouched when they come
  // back - satisfies "preserve entered Employee ID and Password if the
  // user opens and closes a document".
  void _openDocument(LegalDocument doc) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => LegalDocumentPage(
          title: doc.title,
          content: doc.content,
          version: doc.version,
          effectiveDate: doc.effectiveDate,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final docs = LegalDocuments.all;
    final spans = <InlineSpan>[
      const TextSpan(text: 'I have read and agree to the '),
    ];

    for (var i = 0; i < docs.length; i++) {
      spans.add(TextSpan(
        text: docs[i].title,
        style: const TextStyle(
          color: AppColors.primaryBlue,
          decoration: TextDecoration.underline,
        ),
        recognizer: _recognizers[i],
      ));

      if (i < docs.length - 2) {
        spans.add(const TextSpan(text: ', '));
      } else if (i == docs.length - 2) {
        spans.add(const TextSpan(text: ', and '));
      }
    }
    spans.add(const TextSpan(text: '.'));

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 24,
          height: 24,
          child: Checkbox(
            value: widget.checked,
            onChanged: widget.readOnly
                ? null
                : (value) => widget.onChanged(value ?? false),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: RichText(
            text: TextSpan(
              style: AppTextStyles.bodySmall.copyWith(color: AppColors.textGray),
              children: spans,
            ),
          ),
        ),
      ],
    );
  }
}
