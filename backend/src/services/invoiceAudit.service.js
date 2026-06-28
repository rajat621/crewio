<<<<<<< HEAD
﻿import InvoiceAuditLog from '../models/InvoiceAuditLog.js';
=======
import InvoiceAuditLog from '../models/InvoiceAuditLog.js';
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0

/**
 * Create or get audit log for an invoice
 */
export const getOrCreateAuditLog = async (invoiceId, companyId) => {
  let auditLog = await InvoiceAuditLog.findOne({ invoice: invoiceId });

  if (!auditLog) {
    auditLog = new InvoiceAuditLog({
      invoice: invoiceId,
      company: companyId,
      status: 'PENDING',
    });
    await auditLog.save();
  }

  return auditLog;
};

/**
 * Log extraction details
 */
export const logExtraction = async (invoiceId, extractionData) => {
  const auditLog = await InvoiceAuditLog.findOne({ invoice: invoiceId });
  if (!auditLog) return null;

  auditLog.extraction = {
    documentPath: extractionData.documentPath,
    extractionMethod: extractionData.extractionMethod || 'unknown',
    extractionTimestamp: new Date(),
    acceptedRowCount: extractionData.acceptedRows?.length || 0,
    rejectedRowCount: extractionData.rejectedRows?.length || 0,
    confidenceScores: extractionData.confidenceScores,
    validationResult: extractionData.validationResult,
    gatingAction: extractionData.gatingAction,
    requiresManualApproval: extractionData.requiresManualApproval || false,
  };

  auditLog.extractionSnapshot = {
    data: extractionData,
  };

  await auditLog.save();
  return auditLog;
};

/**
 * Log confidence gating decision
 */
export const logConfidenceGating = async (invoiceId, gatingDecision) => {
  const auditLog = await InvoiceAuditLog.findOne({ invoice: invoiceId });
  if (!auditLog) return null;

  auditLog.confidenceGating = {
    timestamp: new Date(),
    decision: gatingDecision.action,
    avgConfidence: gatingDecision.confidence,
    rejectionRate: gatingDecision.rejectionRate,
    approvalRequired: gatingDecision.action === 'REQUIRE_APPROVAL',
  };

  await auditLog.save();
  return auditLog;
};

/**
 * Log manual approval
 */
export const logManualApproval = async (invoiceId, userId, notes = '') => {
  const auditLog = await InvoiceAuditLog.findOne({ invoice: invoiceId });
  if (!auditLog) return null;

  if (auditLog.confidenceGating) {
    auditLog.confidenceGating.approvedBy = userId;
    auditLog.confidenceGating.approvalNotes = notes;
  }

  if (!auditLog.actions) auditLog.actions = [];
  auditLog.actions.push({
    action: 'APPROVED',
    timestamp: new Date(),
    userId,
    details: { notes },
  });

  await auditLog.save();
  return auditLog;
};

/**
 * Log rendering details
 */
export const logRendering = async (invoiceId, renderingData) => {
  const auditLog = await InvoiceAuditLog.findOne({ invoice: invoiceId });
  if (!auditLog) return null;

  auditLog.rendering = {
    templateProfileId: renderingData.templateProfileId,
    templateProfileVersion: renderingData.templateProfileVersion,
    templateId: renderingData.templateId,
    renderingTimestamp: new Date(),
    pageCount: renderingData.pageCount || 1,
    renderingDuration: renderingData.renderingDuration || 0,
    successfulRegions: renderingData.successfulRegions || [],
    warnings: renderingData.warnings || [],
  };

  auditLog.rendererConfigSnapshot = {
    data: renderingData.rendererConfig,
  };

  auditLog.templateProfileSnapshot = {
    data: renderingData.templateProfile,
  };

  await auditLog.save();
  return auditLog;
};

/**
 * Log content validation
 */
export const logContentValidation = async (invoiceId, validationData) => {
  const auditLog = await InvoiceAuditLog.findOne({ invoice: invoiceId });
  if (!auditLog) return null;

  auditLog.contentValidation = {
    totalsMismatch: validationData.totalsMismatch || false,
    totalsMismatchDetails: validationData.totalsMismatchDetails,
    missingRequiredFields: validationData.missingRequiredFields || [],
    overflowDetected: validationData.overflowDetected || false,
    collisionDetected: validationData.collisionDetected || false,
    validationWarnings: validationData.warnings || [],
  };

  await auditLog.save();
  return auditLog;
};

/**
 * Log performance metrics
 */
export const logPerformance = async (invoiceId, performanceData) => {
  const auditLog = await InvoiceAuditLog.findOne({ invoice: invoiceId });
  if (!auditLog) return null;

  auditLog.performance = {
    extractionDuration: performanceData.extractionDuration,
    renderingDuration: performanceData.renderingDuration,
    totalDuration: performanceData.totalDuration,
    pdfFileSize: performanceData.pdfFileSize,
  };

  await auditLog.save();
  return auditLog;
};

/**
 * Log user action
 */
export const logUserAction = async (invoiceId, action, userId, details = {}) => {
  const auditLog = await InvoiceAuditLog.findOne({ invoice: invoiceId });
  if (!auditLog) return null;

  if (!auditLog.actions) auditLog.actions = [];

  auditLog.actions.push({
    action,
    timestamp: new Date(),
    userId,
    details,
  });

  await auditLog.save();
  return auditLog;
};

/**
 * Get full audit trail for an invoice
 */
export const getAuditTrail = async (invoiceId) => {
  return await InvoiceAuditLog.findOne({ invoice: invoiceId })
    .populate('invoice', 'invoiceNumber invoiceDate')
    .populate('company', 'name')
    .populate('actions.userId', 'name email')
    .populate('confidenceGating.approvedBy', 'name email');
};

/**
 * Get audit trails for company
 */
export const getCompanyAuditTrails = async (companyId, filters = {}) => {
  const query = { company: companyId };

  if (filters.status) query.status = filters.status;
  if (filters.gatingDecision) query['confidenceGating.decision'] = filters.gatingDecision;
  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
  }

  return await InvoiceAuditLog.find(query)
    .populate('invoice', 'invoiceNumber invoiceDate')
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Export audit trail as compliance report
 */
export const exportComplianceReport = async (companyId, startDate, endDate) => {
  const logs = await getCompanyAuditTrails(companyId, {
    startDate,
    endDate,
  });

  return {
    reportGenerated: new Date(),
    company: companyId,
    period: { start: startDate, end: endDate },
    totalInvoices: logs.length,
    byGatingDecision: {
      autoGenerated: logs.filter((l) => l.confidenceGating?.decision === 'AUTO_GENERATE').length,
      requiresApproval: logs.filter((l) => l.confidenceGating?.decision === 'REQUIRE_APPROVAL').length,
      blocked: logs.filter((l) => l.confidenceGating?.decision === 'BLOCK').length,
      warned: logs.filter((l) => l.confidenceGating?.decision === 'WARN').length,
    },
    byStatus: {
      pending: logs.filter((l) => l.status === 'PENDING').length,
      approved: logs.filter((l) => l.status === 'APPROVED').length,
      generated: logs.filter((l) => l.status === 'GENERATED').length,
      archived: logs.filter((l) => l.status === 'ARCHIVED').length,
    },
    trails: logs,
  };
};
