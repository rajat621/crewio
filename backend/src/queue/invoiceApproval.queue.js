// backend/src/queue/invoiceApproval.queue.js
import { Queue } from 'bullmq';
import redisConnection from './redis.connection.js';

export const INVOICE_APPROVAL_QUEUE_NAME = 'invoice-approval-jobs';

let invoiceApprovalQueue = null;

// Same stub-when-unavailable pattern as extraction.queue.js - if Redis is
// down, approve requests fail fast with a clear error (see
// invoiceDraft.controller.js's approveInvoiceDraft) rather than silently
// hanging or losing the claim.
if (!redisConnection || process.env.DISABLE_REDIS === 'true') {
  console.warn('Redis disabled or unavailable — using invoice-approval queue stub');
  invoiceApprovalQueue = {
    add: async () => {
      throw new Error('Invoice approval queue unavailable (Redis disabled)');
    },
    close: async () => {},
    getJobCounts: async () => ({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }),
  };
} else {
  invoiceApprovalQueue = new Queue(INVOICE_APPROVAL_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      // Financial-record generation, not extraction - no automatic
      // retries here. A retry after a PARTIAL failure (e.g. PDF rendered
      // and saved to R2, but the Invoice.save() or draft update after it
      // failed) could produce a second invoice number/PDF for the same
      // approval. The atomic Mongo claim in approveInvoiceDraft already
      // guarantees only one job is ever enqueued per draft version, so
      // there is nothing a queue-level retry would legitimately be
      // recovering from - a failed job surfaces as the draft rolling back
      // to 'ready' (see the worker's catch block), and the user can
      // explicitly re-click Approve, which goes through the same atomic
      // claim + idempotency-key path again.
      attempts: 1,
      removeOnComplete: 500,
      removeOnFail: 500,
    },
  });
}

export { invoiceApprovalQueue };
export default invoiceApprovalQueue;
