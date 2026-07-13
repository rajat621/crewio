import AuditLog from '../models/AuditLog.js';

// Was previously a no-op stub (`return logData` without ever touching the
// database) despite being called from several places that assumed it
// persisted something - security-relevant events (logins, permission
// changes, salary/payroll edits) were silently never recorded.
export const createAuditLog = async (logData = {}) => {
  try {
    return await AuditLog.create({
      user: logData.user || null,
      action: logData.action,
      entity: logData.entity,
      entityId: logData.entityId,
      changes: logData.changes,
      company: logData.company || null,
      ownerId: logData.ownerId || null,
    });
  } catch (error) {
    // Audit logging must never break the calling request.
    console.error('[audit] failed to write audit log', error.message);
    return null;
  }
};

export default { createAuditLog };
