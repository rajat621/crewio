/**
 * Production confidence gating rules for invoice generation
 * Blocks automatic generation if extraction quality is insufficient
 */

export const CONFIDENCE_THRESHOLDS = {
  CRITICAL: 0.95,       // Must approve manually if below this
  HIGH: 0.85,           // Warn if below this
  ACCEPTABLE: 0.70,     // Block if below this
};

export const REJECTION_THRESHOLDS = {
  CRITICAL: 0.05,       // More than 5% rows rejected = block
  WARNING: 0.02,        // More than 2% rows rejected = warn
};

/**
 * Validate extraction quality before invoice generation
 * @returns { approved: boolean, warnings: string[], errors: string[] }
 */
export const validateExtractionQuality = (extractionData, config = {}) => {
  const errors = [];
  const warnings = [];

  const {
    confidenceThreshold = CONFIDENCE_THRESHOLDS.ACCEPTABLE,
    rejectionThreshold = REJECTION_THRESHOLDS.CRITICAL,
  } = config;

  // 1. Check minimum accepted rows
  const acceptedRows = extractionData.accepted_rows || [];
  if (!acceptedRows || acceptedRows.length === 0) {
    errors.push('No valid rows extracted from document');
  }

  // 2. Calculate overall confidence score
  const confidenceScores = extractionData.confidence_scores || {};
  const scores = Object.values(confidenceScores).filter((s) => typeof s === 'number');
  const avgConfidence = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  if (avgConfidence < confidenceThreshold) {
    errors.push(
      `Overall extraction confidence (${(avgConfidence * 100).toFixed(2)}%) ` +
      `below minimum threshold (${(confidenceThreshold * 100).toFixed(2)}%)`
    );
  }

  if (avgConfidence < CONFIDENCE_THRESHOLDS.HIGH && avgConfidence >= CONFIDENCE_THRESHOLDS.ACCEPTABLE) {
    warnings.push(
      `Extraction confidence (${(avgConfidence * 100).toFixed(2)}%) is below recommended ` +
      `threshold (${(CONFIDENCE_THRESHOLDS.HIGH * 100).toFixed(2)}%). Recommend review.`
    );
  }

  // 3. Check for low-confidence individual rows
  const lowConfidenceRows = Object.entries(confidenceScores)
    .filter(([, score]) => score < CONFIDENCE_THRESHOLDS.ACCEPTABLE)
    .map(([rowKey]) => rowKey);

  if (lowConfidenceRows.length > 0) {
    warnings.push(
      `${lowConfidenceRows.length} row(s) have low confidence: ${lowConfidenceRows.join(', ')}`
    );
  }

  // 4. Check rejection rate
  const rejectedRows = extractionData.rejected_rows || [];
  if (acceptedRows.length + rejectedRows.length > 0) {
    const rejectionRate = rejectedRows.length / (acceptedRows.length + rejectedRows.length);

    if (rejectionRate > rejectionThreshold) {
      errors.push(
        `Rejection rate (${(rejectionRate * 100).toFixed(2)}%) ` +
        `exceeds maximum (${(rejectionThreshold * 100).toFixed(2)}%). ` +
        `${rejectedRows.length} rows rejected.`
      );
    }

    if (rejectionRate > REJECTION_THRESHOLDS.WARNING && rejectionRate <= rejectionThreshold) {
      warnings.push(
        `${rejectedRows.length} row(s) rejected (${(rejectionRate * 100).toFixed(2)}% rate). ` +
        `Recommend review before generation.`
      );
    }
  }

  // 5. Validate totals computation
  if (extractionData.totals) {
    const { subtotal, vat_amount, total } = extractionData.totals;
    if (
      typeof subtotal === 'number' &&
      typeof vat_amount === 'number' &&
      typeof total === 'number'
    ) {
      const expectedTotal = subtotal + vat_amount;
      const tolerance = 0.01; // Allow 0.01 rounding error
      if (Math.abs(total - expectedTotal) > tolerance) {
        warnings.push(
          `Totals mismatch: computed ${expectedTotal.toFixed(2)} but extracted ${total.toFixed(2)}`
        );
      }
    }
  }

  // 6. Check for required fields in each row
  const requiredFields = ['trade', 'rate', 'hours'];
  const rowsWithMissingFields = acceptedRows.filter((row) =>
    requiredFields.some((field) => !row[field] || String(row[field]).trim() === '')
  );

  if (rowsWithMissingFields.length > 0) {
    warnings.push(
      `${rowsWithMissingFields.length} row(s) have missing required fields. ` +
      `Recommend manual review.`
    );
  }

  return {
    approved: errors.length === 0,
    confident: avgConfidence >= CONFIDENCE_THRESHOLDS.HIGH,
    avgConfidence,
    rejectionRate: rejectedRows.length / (acceptedRows.length + rejectedRows.length),
    acceptedRowCount: acceptedRows.length,
    rejectedRowCount: rejectedRows.length,
    errors,
    warnings,
  };
};

/**
 * Require explicit approval if confidence is low
 */
export const requiresManualApproval = (validationResult) => {
  return !validationResult.approved || !validationResult.confident;
};

/**
 * Get confidence gating action recommendation
 */
export const getGatingAction = (validationResult) => {
  if (!validationResult.approved) {
    return {
      action: 'BLOCK',
      reason: 'Critical validation failures',
      details: validationResult.errors,
    };
  }

  if (!validationResult.confident) {
    return {
      action: 'REQUIRE_APPROVAL',
      reason: 'Extraction confidence below recommended threshold',
      details: validationResult.warnings,
      confidence: validationResult.avgConfidence,
    };
  }

  if (validationResult.warnings.length > 0) {
    return {
      action: 'WARN',
      reason: 'Minor quality concerns detected',
      details: validationResult.warnings,
      confidence: validationResult.avgConfidence,
    };
  }

  return {
    action: 'AUTO_GENERATE',
    reason: 'All quality checks passed',
    confidence: validationResult.avgConfidence,
  };
};
