// backend/src/workers/invoiceApproval.worker.js
//
// Moves invoice-approval's actual work (AI recompute, PDF render, R2/local
// save, Invoice + InvoiceDraft writes, audit log) off the HTTP request
// thread. invoiceDraft.controller.js's approveInvoiceDraft does the fast,
// synchronous part only - validation and the atomic claim that prevents a
// duplicate approval - then enqueues a job here and returns 202
// immediately. This file is the exact logic the old synchronous handler
// used to run inline, extracted verbatim (no behavior change to the
// render/save/invoice-creation steps themselves), parameterized by job
// data instead of `req`.
import dotenv from 'dotenv';
import { Worker } from 'bullmq';

import { connectDB } from '../config/db.js';
import redisConnection from '../queue/redis.connection.js';
import { INVOICE_APPROVAL_QUEUE_NAME } from '../queue/invoiceApproval.queue.js';
import InvoiceDraft from '../models/InvoiceDraft.js';
import Company from '../models/Company.js';
import User from '../models/User.js';
import { Invoice } from '../models/Invoice.js';
import {
  reserveTempFilePath,
  saveLocalFile,
  cleanupTempFile,
  deleteObject,
} from '../services/storage.service.js';
import { recomputeDraft, summariseDraft } from '../services/invoiceDraft.service.js';
import { generateInvoiceNumber } from '../services/invoiceNumber.service.js';
import { createAuditLog } from '../services/audit.service.js';
import { renderInvoicePdf } from '../services/invoiceRenderer.service.js';
import { buildRendererPayload } from '../controllers/invoice.controller.js';

dotenv.config();

const isEnabled = (v, defaultValue = false) => {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return defaultValue;
  const x = v.trim().toLowerCase();
  return x === '1' || x === 'true' || x === 'yes' || x === 'on';
};

const logEvent = (event, data = {}) => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: 'invoice-approval-worker', event, ...data }));
};

// Rolls a claimed draft back to 'ready' (still editable, still
// re-approvable) with a user-facing error message - the same recovery
// path the old synchronous handler's catch block used, just reachable
// from the worker instead of the request. Never throws itself: a failure
// here must not mask the original error that triggered the rollback.
const rollbackDraft = async (draftId, message) => {
  try {
    await InvoiceDraft.findByIdAndUpdate(draftId, {
      status: 'ready',
      approvedAt: null,
      error: message,
    });
  } catch (rollbackError) {
    logEvent('rollback_failed', { draftId: String(draftId), error: rollbackError.message });
  }
};

const processApproval = async (job) => {
  const { draftId, ownerId, userId, companyId, payload, expectedVersion } = job.data;
  const startedAt = Date.now();
  logEvent('job_start', { draftId, jobId: job.id });

  let claimedDraft;
  let savedFileRef = null;
  try {
    // Atomic claim: the HTTP handler already atomically flipped this to
    // 'approving' before enqueueing, but that alone isn't enough to stop
    // this specific job from running twice. BullMQ can redeliver the same
    // job to another worker (or this one again) if processing outruns the
    // lock (default lockDuration 30s - AI recompute + PDF render + R2
    // upload can easily exceed that under load, see the Worker() options
    // below). A plain read-then-compare of `status !== 'approving'` is
    // not a defense against that: two concurrent deliveries could both
    // read 'approving' before either writes back. This findOneAndUpdate
    // is the actual compare-and-swap - only one delivery can ever
    // transition 'approving' -> 'processing' for a given draft; every
    // other delivery (concurrent or stalled-redelivered) gets null back
    // and skips.
    claimedDraft = await InvoiceDraft.findOneAndUpdate(
      { _id: draftId, status: 'approving' },
      { $set: { status: 'processing' } },
      { new: true }
    );
    if (!claimedDraft) {
      const current = await InvoiceDraft.findById(draftId);
      if (!current) throw new Error('Draft not found');
      logEvent('job_skipped_stale', { draftId, actualStatus: current.status });
      return { skipped: true };
    }

    const recomputed = await recomputeDraft({ draft: payload });
    const finalPayload = recomputed?.data || payload;
    const blocking = finalPayload?.blocking_issues || [];
    if (blocking.length) {
      await rollbackDraft(draftId, 'Draft is not ready to approve: ' + blocking.join('; '));
      logEvent('job_blocked', { draftId, issues: blocking });
      return { blocked: true };
    }
    const totals = finalPayload?.totals || {};

    const draft = claimedDraft;

    const clientCompany = await Company.findOne({
      _id: draft.companyId,
      ownerId: draft.ownerId,
      $or: [
        { companyRole: 'client' },
        { companyRole: { $exists: false }, isOwner: { $ne: true } },
      ],
    });
    if (!clientCompany) {
      await rollbackDraft(draftId, 'Client company not found for this draft');
      return { failed: true };
    }

    let ownerCompany = await Company.findOne({
      ownerId: draft.ownerId,
      $or: [{ companyRole: 'owner' }, { isOwner: true }],
    });
    if (!ownerCompany) {
      const ownerUser = await User.findById(userId).populate('company');
      ownerCompany = ownerUser?.company || null;
    }
    if (!ownerCompany) ownerCompany = clientCompany;

    // generateInvoiceNumber reserves the number by incrementing the
    // counter - only happens here, at real approval, never earlier.
    const invoiceNumber = await generateInvoiceNumber(userId, draft.ownerId);

    const items = (finalPayload?.rows || [])
      .filter((row) => !row.removed)
      .map((row) => ({
        description: row.trade || row.description,
        quantity: row.hours,
        rate: row.rate,
        amount: row.amount,
      }));

    const rendererItems = (finalPayload?.rows || [])
      .filter((row) => !row.removed)
      .map((row) => ({
        description: row.trade || row.description,
        quantity: row.hours,
        rate: row.rate,
        amount: row.amount,
        project: row.project_id || '',
        identifier: row.project_id || '',
      }));

    const deductionBreakdown = {};
    for (const line of finalPayload?.deduction_lines || []) {
      if (line.removed) continue;
      const label = line.label || 'Deduction';
      deductionBreakdown[label] = Number((deductionBreakdown[label] || 0) + Number(line.amount || 0));
    }

    const financials = {
      subtotal: totals.subtotal || 0,
      total_deduction: totals.deductions || 0,
      deduction_vat: totals.deduction_vat || 0,
      deduction_total_with_vat: Number(((totals.deductions || 0) + (totals.deduction_vat || 0)).toFixed(3)),
      adjusted_subtotal: totals.adjusted_subtotal ?? Math.max(0, (totals.subtotal || 0) - (totals.deductions || 0)),
      total_vat: totals.vat || 0,
      net_payable: totals.net_total || 0,
      deduction_source: 'user_approved',
      summary_detected: (totals.deductions || 0) > 0,
      deduction_breakdown: deductionBreakdown,
    };

    const opts = draft.renderOptions || {};

    const invoice = new Invoice({
      createdBy: userId,
      ownerId: draft.ownerId,
      company: clientCompany._id,
      invoiceNumber,
      sourceDraftId: draft._id,
      clientName: clientCompany.name || finalPayload?.meta?.client_name || 'Client',
      items,
      subtotal: totals.subtotal,
      vatAmount: totals.vat,
      tax: totals.vat_rate || 0,
      total: totals.net_total,
      invoiceDate: opts.invoiceDate || new Date(),
      status: 'draft',
      source_timesheet_pdf: draft.sourcePath,
      generated_invoice_pdf: '',
      pdfUrl: '',
      extraction_warnings: finalPayload?.extraction_warnings || [],
    });

    const rendererPayload = buildRendererPayload({
      invoice,
      ownerCompany,
      clientCompany,
      items: rendererItems,
      totals: {
        subtotal: totals.subtotal,
        vatAmount: totals.vat,
        total: totals.net_total,
        financials,
      },
      totalDeduction: totals.deductions || 0,
      includeSignature: opts.includeSignature ?? true,
      includeStamp: opts.includeStamp ?? true,
      includeTemplate: opts.includeTemplate ?? true,
    });

    const outputAbsolutePath = await reserveTempFilePath(`${invoiceNumber}.pdf`);
    let generatedInvoicePdf = '';
    try {
      await renderInvoicePdf({ ...rendererPayload, outputPath: outputAbsolutePath });

      const saved = await saveLocalFile({
        absolutePath: outputAbsolutePath,
        companyId: companyId || null,
        ownerId: draft.ownerId,
        folder: 'invoices',
        filename: `${invoiceNumber}.pdf`,
      });
      generatedInvoicePdf = saved.path;
      // Tracked outside this try block so the outer catch can clean up an
      // orphaned upload if invoice.save() (below) fails after this point -
      // storage.service.js's saveBuffer() has no rollback of its own.
      savedFileRef = { key: saved.key, driver: saved.driver };
    } finally {
      await cleanupTempFile(outputAbsolutePath);
    }

    invoice.generated_invoice_pdf = generatedInvoicePdf;
    invoice.pdfUrl = generatedInvoicePdf;
    await invoice.save();

    await InvoiceDraft.findByIdAndUpdate(draftId, {
      status: 'approved',
      approvedAt: new Date(),
      error: null,
      payload: finalPayload,
      editSummary: finalPayload?.edit_summary || null,
      invoiceId: invoice._id,
      ...summariseDraft(finalPayload),
    });

    createAuditLog({
      user: userId || null,
      action: 'invoice.approved',
      entity: 'Invoice',
      entityId: String(invoice._id),
      changes: { draftId: String(draftId), invoiceNumber },
      ownerId: draft.ownerId,
    }).catch(() => {});

    logEvent('job_completed', { draftId, invoiceId: String(invoice._id), invoiceNumber, elapsedMs: Date.now() - startedAt });
    return { invoiceId: String(invoice._id), invoiceNumber };
  } catch (error) {
    logEvent('job_failed', { draftId, error: error.message, elapsedMs: Date.now() - startedAt });
    if (savedFileRef) {
      // The PDF made it to storage but a later step (invoice.save() or
      // beyond) threw - without this, the object is orphaned forever since
      // no Invoice record will ever reference it. Best-effort: a failure
      // here must not mask the original error.
      await deleteObject(savedFileRef).catch((cleanupError) => {
        logEvent('orphaned_file_cleanup_failed', { draftId, key: savedFileRef.key, error: cleanupError.message });
      });
    }
    await rollbackDraft(draftId, 'Failed to generate invoice. Please try approving again.');
    // Re-throw so BullMQ marks the job itself failed (visible in
    // getJobCounts/dashboards) - the draft-level rollback above is what
    // actually recovers user-facing state; this is for operational
    // visibility only, not retried (see invoiceApproval.queue.js's
    // attempts: 1).
    throw error;
  }
};

const bootstrap = async () => {
  if (!isEnabled(process.env.ENABLE_INVOICE_APPROVAL_WORKER, true)) {
    logEvent('worker_disabled', { reason: 'ENABLE_INVOICE_APPROVAL_WORKER=false' });
    return;
  }

  await connectDB();

  const worker = new Worker(INVOICE_APPROVAL_QUEUE_NAME, processApproval, {
    connection: redisConnection,
    // Financial PDF rendering is CPU/IO-bound but individually cheap
    // compared to the AI-extraction worker's OCR pipeline - a modest
    // concurrency here bounds simultaneous R2 uploads/PDF renders per
    // process without serializing every approval behind a single worker.
    concurrency: Number(process.env.INVOICE_APPROVAL_WORKER_CONCURRENCY || 4),
    // BullMQ's default lockDuration (30s) can be exceeded by AI recompute
    // + PDF render + R2 upload under load, which would make BullMQ treat
    // an in-flight job as stalled and redeliver it to another worker -
    // the processApproval's atomic 'approving'->'processing' claim makes
    // a redelivered job a safe no-op, but raising the lock well above
    // realistic processing time means that path is rarely even exercised.
    // stalledInterval matches lockDuration so BullMQ's stalled-check
    // cadence doesn't itself trigger spurious redelivery mid-lock.
    lockDuration: Number(process.env.INVOICE_APPROVAL_WORKER_LOCK_MS || 180000),
    stalledInterval: Number(process.env.INVOICE_APPROVAL_WORKER_LOCK_MS || 180000),
  });

  worker.on('completed', (job) => logEvent('queue_completed', { queueJobId: job.id }));
  worker.on('failed', (job, error) => logEvent('queue_failed', { queueJobId: job?.id, error: error?.message }));
  worker.on('error', (error) => logEvent('worker_error', { error: error?.message }));

  logEvent('worker_started', { queue: INVOICE_APPROVAL_QUEUE_NAME });

  // Same graceful-shutdown reasoning as extraction.worker.js: SIGTERM
  // (Railway deploy/restart) must let BullMQ finish in-flight jobs rather
  // than kill them mid-render, which could otherwise leave a draft stuck
  // in 'approving' forever (no invoice, no rollback).
  const shutdown = async (signal) => {
    logEvent('worker_shutdown_start', { signal });
    try {
      await worker.close();
      logEvent('worker_shutdown_complete', { signal });
    } catch (err) {
      logEvent('worker_shutdown_error', { signal, error: err?.message });
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

bootstrap().catch((error) => {
  logEvent('worker_fatal', { error: error?.message });
  process.exit(1);
});
