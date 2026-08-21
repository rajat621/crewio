import { randomUUID } from 'crypto';
import { serverError } from '../utils/apiResponse.js';
import InvoiceDraft from '../models/InvoiceDraft.js';
import FileRecord from '../models/FileRecord.js';
import Company from '../models/Company.js';
import { getAuthContext } from '../utils/tenant.js';
import {
  downloadToTempFile,
  driverFromStoredPath,
} from '../services/storage.service.js';
import {
  buildDraft,
  recomputeDraft,
  summariseDraft,
} from '../services/invoiceDraft.service.js';
import { invoiceApprovalQueue } from '../queue/invoiceApproval.queue.js';
import { withTimeout } from '../utils/cache.util.js';

// The shared Redis connection uses maxRetriesPerRequest:null (required by
// BullMQ), which means a Queue.add() call made directly from this request
// handler could otherwise queue indefinitely during a Redis outage instead
// of failing fast - bound it the same way cache.util.js bounds its own
// Redis calls.
const QUEUE_ADD_TIMEOUT_MS = 5000;

/**
 * Invoice drafts: the human approval step between extraction and PDF.
 *
 * Endpoint shape:
 *   POST   /api/invoices/drafts              start extraction, return draftId
 *   GET    /api/invoices/drafts/:id          poll status / load for editing
 *   PATCH  /api/invoices/drafts/:id          autosave edits, get fresh totals
 *   POST   /api/invoices/drafts/:id/approve  render PDF, create Invoice
 *   DELETE /api/invoices/drafts/:id          discard
 */

const resolveStorageRef = (fileRecord) => ({
  driver: fileRecord.storageDriver || driverFromStoredPath(fileRecord.path),
  key: fileRecord.storageKey || fileRecord.path,
});

const loadOwnedDraft = async (req, res) => {
  const ctx = getAuthContext(req);
  const draft = await InvoiceDraft.findById(req.params.id);

  if (!draft) {
    res.status(404).json({ message: 'Draft not found or expired' });
    return null;
  }

  const ownerMatches = String(draft.ownerId) === String(ctx.ownerId || ctx.userId);
  const companyMatches = String(draft.companyId) === String(ctx.companyId);
  if (!ownerMatches && !companyMatches) {
    res.status(403).json({ message: 'Access denied to this draft' });
    return null;
  }

  return draft;
};

/**
 * Start a draft.
 *
 * Returns 202 immediately with a draftId so the preview window - which the
 * frontend already opened on the click, before any await, to stay ahead of
 * popup blockers - has something to poll. Extraction continues in the
 * background.
 */
export const createInvoiceDraft = async (req, res) => {
  try {
    const {
      pdfPath,
      companyId,
      owner_company_id,
      template_override,
      signature_override,
      stamp_override,
      include_signature = true,
      include_stamp = true,
      include_template = true,
      company_data = {},
      vatRate,
      invoiceDate,
    } = req.body || {};

    if (!pdfPath) {
      return res.status(400).json({ message: 'pdfPath is required' });
    }
    if (!companyId) {
      return res.status(400).json({ message: 'companyId is required' });
    }

    const ownerIdForValidation = getAuthContext(req).ownerId || req.user?.userId;
    const validCompany = await Company.findOne({
      _id: companyId,
      ownerId: ownerIdForValidation,
      $or: [
        { companyRole: 'client' },
        { companyRole: { $exists: false }, isOwner: { $ne: true } },
      ],
    }).select('_id');
    if (!validCompany) {
      return res.status(400).json({ message: 'Client company not found for current user' });
    }

    const fileRecord = await FileRecord.findOne({ path: pdfPath });
    if (!fileRecord) {
      return res.status(400).json({ message: 'pdfPath is not an authorized file' });
    }

    const ctx = getAuthContext(req);
    const ownerMatches =
      String(fileRecord.ownerId) === String(ctx.ownerId || ctx.userId);
    const companyMatches = String(fileRecord.companyId) === String(ctx.companyId);
    if (!ownerMatches && !companyMatches) {
      return res.status(403).json({ message: 'Access denied to requested file' });
    }

    const draft = await InvoiceDraft.create({
      ownerId: ctx.ownerId || ctx.userId,
      companyId,
      createdBy: req.user?.userId,
      sourceFileId: fileRecord._id,
      sourceFileName: fileRecord.originalName,
      sourcePath: pdfPath,
      status: 'extracting',
      renderOptions: {
        ownerCompanyId: owner_company_id || null,
        templatePath: template_override,
        signaturePath: signature_override,
        stampPath: stamp_override,
        includeSignature: include_signature,
        includeStamp: include_stamp,
        includeTemplate: include_template,
        companyData: company_data,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
      },
    });

    // Fire and forget. Failures land on the draft record, which the preview
    // window is already polling, so the user sees the reason in the window
    // they are looking at rather than a toast on a page behind it.
    runExtraction(draft._id, fileRecord, vatRate).catch((error) => {
      console.error('Draft extraction failed:', error.message);
    });

    return res.status(202).json({
      message: 'Draft started',
      data: { draftId: String(draft._id), status: draft.status },
    });
  } catch (error) {
    return serverError(res, 'Failed to start invoice draft');
  }
};

const runExtraction = async (draftId, fileRecord, vatRate) => {
  const { driver, key } = resolveStorageRef(fileRecord);
  const tempFile = await downloadToTempFile({ key, driver });

  try {
    const response = await buildDraft({ pdfPath: tempFile.path, vatRate });
    const payload = response?.data || response;

    await InvoiceDraft.findByIdAndUpdate(draftId, {
      status: 'ready',
      payload,
      ...summariseDraft(payload),
    });
  } catch (error) {
    // D19.12 finding: `draft.error` is returned verbatim to the client in
    // `getInvoiceDraft` (below) - the comment on the fire-and-forget caller
    // above ("the user sees the reason in the window they are looking at")
    // confirms this is intentional UX, not an oversight, so this isn't
    // genericized to nothing the way the D19.12 mobile-controller findings
    // were. But `error.message` here can originate from the AI service
    // HTTP call itself (network/connection errors can include internal
    // hostnames/ports) as easily as from a genuine "this PDF couldn't be
    // read" extraction failure, and there was no distinction between the
    // two before reaching the client - only same-tenant exposure (this
    // draft's own owner), but still real infrastructure-detail leakage,
    // inconsistent with the generic-to-client/detailed-to-logs standard
    // applied everywhere else in this codebase (see error.middleware.js).
    // Full detail is still logged server-side (previously this catch block
    // logged nothing at all); the client-facing field is capped to a
    // short, generic reason.
    console.error('[invoice-draft] extraction failed', { draftId: String(draftId), error: error.message });
    await InvoiceDraft.findByIdAndUpdate(draftId, {
      status: 'failed',
      error: 'Extraction failed. Please try again or upload a different file.',
    });
  } finally {
    await tempFile.cleanup();
  }
};

/** Poll status, or load the draft for editing once it is ready. */
export const getInvoiceDraft = async (req, res) => {
  try {
    let draft = await loadOwnedDraft(req, res);
    if (!draft) return undefined;

    // Timeout self-heal: a draft can only leave 'approving'/'processing'
    // via the invoice-approval worker (success -> 'approved', failure ->
    // rollbackDraft's 'ready'). If that worker process isn't running at
    // all (misconfigured deploy, crashed, never started) the job that was
    // enqueued for this draft will simply never be picked up, and nothing
    // else ever touches this document - it would otherwise sit stuck
    // forever, unable to be re-approved (status isn't 'ready') or
    // discarded (discardInvoiceDraft's guard). Polling is exactly where a
    // stuck claim gets noticed, so recover it here: past a generous
    // timeout with no update, treat it the same as a failed job and roll
    // it back with an explicit, honest error message.
    const APPROVAL_TIMEOUT_MS = 2 * 60 * 1000;
    if (
      (draft.status === 'approving' || draft.status === 'processing') &&
      Date.now() - new Date(draft.updatedAt).getTime() > APPROVAL_TIMEOUT_MS
    ) {
      const recovered = await InvoiceDraft.findOneAndUpdate(
        { _id: draft._id, status: { $in: ['approving', 'processing'] } },
        { $set: { status: 'ready', error: 'Invoice generation timed out. Please try approving again.' } },
        { new: true }
      );
      if (recovered) draft = recovered;
    }

    return res.json({
      message: 'Draft retrieved',
      data: {
        draftId: String(draft._id),
        status: draft.status,
        payload: draft.payload,
        totals: draft.totals,
        blockingIssues: draft.blockingIssues,
        sourceFileName: draft.sourceFileName,
        sourcePath: draft.sourcePath,
        invoiceId: draft.invoiceId ? String(draft.invoiceId) : null,
        error: draft.error,
        version: draft.__v,
      },
    });
  } catch (error) {
    return serverError(res, 'Failed to retrieve draft');
  }
};

/**
 * Autosave.
 *
 * The browser sends the edited draft; the AI service recomputes it; we store
 * what comes back. Client-supplied totals are discarded, not merged - the
 * response the UI receives is the authoritative one, so a stale tab cannot
 * bank a wrong number.
 */
export const updateInvoiceDraft = async (req, res) => {
  try {
    const draft = await loadOwnedDraft(req, res);
    if (!draft) return undefined;

    if (draft.status === 'approved') {
      return res.status(409).json({
        message: 'This draft is already approved and cannot be edited',
      });
    }
    if (draft.status !== 'ready') {
      return res.status(409).json({
        message: `Draft is ${draft.status} and cannot be edited yet`,
      });
    }

    const incoming = req.body?.payload;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ message: 'payload is required' });
    }

    // Optional optimistic-concurrency guard - only enforced if the caller
    // provides expectedVersion. Protects against saving over a newer edit
    // the caller hasn't seen (e.g. two reviewers, or two tabs) without
    // requiring every existing caller to already send this field.
    const expectedVersion = req.body?.expectedVersion;
    if (expectedVersion !== undefined && Number(expectedVersion) !== draft.__v) {
      return res.status(409).json({
        message: 'This draft has been updated since you loaded it. Please reload before saving.',
        currentVersion: draft.__v,
      });
    }

    const response = await recomputeDraft({ draft: incoming });
    const payload = response?.data || response;
    const summary = summariseDraft(payload);

    // Atomic save: status:'ready' (and __v, if the caller sent
    // expectedVersion) are checked as part of the SAME operation that
    // writes the new payload - not a separate earlier check followed by
    // an unconditional save(). Without this, a concurrent approval
    // committing between the read above and this write would have its
    // 'approved' status silently reverted, since save() persists this
    // request's entire in-memory document, including its now-stale
    // in-memory status field, not just the fields explicitly reassigned.
    const atomicFilter = { _id: draft._id, ownerId: draft.ownerId, status: 'ready' };
    if (expectedVersion !== undefined) {
      atomicFilter.__v = Number(expectedVersion);
    }
    const updated = await InvoiceDraft.findOneAndUpdate(
      atomicFilter,
      { $set: { payload, ...summary }, $inc: { __v: 1 } },
      { new: true }
    );
    if (!updated) {
      // Re-read (read-only, cannot itself race) to give an accurate
      // reason without leaking whether the mismatch was status or
      // version.
      const current = await InvoiceDraft.findById(draft._id);
      if (current?.status === 'approved') {
        return res.status(409).json({ message: 'This draft is already approved and cannot be edited' });
      }
      if (current && current.status !== 'ready') {
        return res.status(409).json({ message: `Draft is ${current.status} and cannot be edited yet` });
      }
      return res.status(409).json({
        message: 'This draft has been updated since you loaded it. Please reload before saving.',
        currentVersion: current?.__v,
      });
    }

    return res.json({
      message: 'Draft saved',
      data: {
        payload,
        totals: updated.totals,
        blockingIssues: updated.blockingIssues,
        version: updated.__v,
      },
    });
  } catch (error) {
    return serverError(res, 'Failed to save draft');
  }
};

/**
 * Approve and render.
 *
 * The invoice number is reserved here, at approval, and nowhere earlier.
 * Drafts that are abandoned or discarded therefore leave no gaps in the
 * sequence, which matters for VAT filing.
 *
 * Rendering happens in Node, through the exact same renderInvoicePdf /
 * buildRendererPayload pipeline invoice.controller.js's createInvoice
 * already uses - not the AI service. Two reasons:
 *
 * 1. The AI service has no idea who the client or owner company is, what
 *    their TRN is, or where their template/signature/stamp files live -
 *    that context only exists here, resolved from the Company collection
 *    exactly like createInvoice resolves it below. Rendering elsewhere
 *    meant every approved invoice printed with blank company details.
 * 2. It sidesteps the cross-process file problem entirely - there is no
 *    "download the PDF back from a path in another process's filesystem"
 *    step, because nothing renders anywhere but here.
 *
 * The AI service is still used for one thing: recomputeDraft, a pure
 * calculation (no rendering, no filesystem), to get the final, trustworthy
 * totals one more time before they're written to Mongo and handed to the
 * renderer.
 */
export const approveInvoiceDraft = async (req, res) => {
  let claimedDraft = null;
  try {
    const draft = await loadOwnedDraft(req, res);
    if (!draft) return undefined;

    if (draft.status === 'approved') {
      return res.status(409).json({
        message: 'This draft is already approved',
        data: { invoiceId: String(draft.invoiceId) },
      });
    }
    if (draft.status !== 'ready') {
      return res.status(409).json({ message: `Draft is ${draft.status}` });
    }

    // Fail-closed: approval (unlike mere autosave) creates an irreversible
    // financial record, so a missing version proof is rejected outright
    // rather than silently allowed through. The live frontend has sent
    // expectedVersion unconditionally since Phase 4.5's wiring, so this
    // does not break the real UI - it only rejects requests (direct API
    // calls, older/other clients) that skip the review-freshness proof
    // entirely, which is exactly what should be rejected here.
    const expectedVersion = req.body?.expectedVersion;
    if (expectedVersion === undefined || expectedVersion === null) {
      return res.status(400).json({ message: 'expectedVersion is required to approve a draft' });
    }

    const payload = req.body?.payload || draft.payload;
    if (!payload) {
      return res.status(400).json({ message: 'Draft has no content to render' });
    }

    // Atomic claim: draft ID + tenant + status + version are all part of
    // the SAME findOneAndUpdate, so there is no window between checking
    // these predicates and committing the transition where a concurrent
    // request (or a stale version) could slip through - the same
    // guarantee the previous synchronous handler had, just committing to
    // 'approving' (queued/processing) instead of 'approved' directly,
    // since no invoice exists yet at this point. This claim is also the
    // ENTIRE duplicate-approval defense for the async job below - only
    // one request can ever win it for a given draft version, so only one
    // job is ever enqueued per approval attempt.
    claimedDraft = await InvoiceDraft.findOneAndUpdate(
      { _id: draft._id, ownerId: draft.ownerId, status: 'ready', __v: Number(expectedVersion) },
      { $set: { status: 'approving', approvedBy: req.user?.userId, error: null }, $inc: { __v: 1 } },
      { new: true }
    );
    if (!claimedDraft) {
      // Distinguish "someone else already claimed/changed this" from
      // "stale version" for a clearer message, without leaking whether
      // the mismatch was tenant, status, or version - re-reading here is
      // read-only and cannot itself create a race, since claimedDraft
      // being null already proves this request did not win.
      const current = await InvoiceDraft.findById(draft._id);
      if (current && current.status === 'ready' && current.__v !== Number(expectedVersion)) {
        return res.status(409).json({
          message: 'This draft has been updated since you loaded it. Please reload before approving.',
          currentVersion: current.__v,
        });
      }
      return res.status(409).json({ message: `Draft is ${current?.status || 'no longer ready for approval'}` });
    }

    try {
      // Deterministic jobId (draftId + the version this claim just
      // committed to) - defense-in-depth on top of the atomic claim
      // above: even if something enqueued twice for the exact same
      // claim, BullMQ treats a second add() with an existing jobId as a
      // no-op rather than running the job twice.
      await withTimeout(
        invoiceApprovalQueue.add(
          'approve',
          {
            draftId: String(claimedDraft._id),
            ownerId: String(claimedDraft.ownerId),
            userId: req.user?.userId || null,
            companyId: req.user?.companyId || null,
            payload,
            expectedVersion: claimedDraft.__v,
          },
          { jobId: `approve:${claimedDraft._id}:${claimedDraft.__v}` }
        ),
        QUEUE_ADD_TIMEOUT_MS
      );
    } catch (enqueueError) {
      // Queue unavailable (Redis down) - roll the claim back immediately
      // rather than leaving the draft stuck in 'approving' with no job
      // that will ever process it.
      await InvoiceDraft.findByIdAndUpdate(claimedDraft._id, {
        status: 'ready',
        error: 'Approval could not be queued right now. Please try again.',
      });
      console.error('Failed to enqueue invoice approval job:', enqueueError.message);
      return serverError(res, 'Failed to queue invoice approval');
    }

    return res.status(202).json({
      message: 'Invoice approval queued',
      data: { draftId: String(claimedDraft._id), status: 'approving', version: claimedDraft.__v },
    });
  } catch (error) {
    // Claim succeeded but something before/around enqueue threw
    // unexpectedly - same rollback reasoning as the enqueue-failure path
    // above, so the draft never gets permanently stranded off 'ready'.
    if (claimedDraft) {
      try {
        await InvoiceDraft.findByIdAndUpdate(claimedDraft._id, { status: 'ready', error: null });
      } catch (rollbackError) {
        console.error('Failed to roll back draft approval claim:', rollbackError.message);
      }
    }
    return serverError(res, 'Failed to queue invoice approval');
  }
};

export const discardInvoiceDraft = async (req, res) => {
  try {
    const draft = await loadOwnedDraft(req, res);
    if (!draft) return undefined;

    // 'approving'/'processing' included: a job may be mid-flight in the
    // worker right now (recompute/render/save), about to create a real
    // Invoice and flip this draft to 'approved' - discarding underneath
    // it would let the worker's later write resurrect a 'discarded' draft
    // back to 'approved' with an invoiceId, or (worse, if the worker's
    // own findByIdAndUpdate loses this specific race) leave an Invoice
    // pointing at a draft the user believes they discarded. Same
    // financial-correctness reasoning as the 'approved' guard already had.
    if (draft.status === 'approved' || draft.status === 'approving' || draft.status === 'processing') {
      return res.status(409).json({
        message: draft.status === 'approved'
          ? 'Approved drafts cannot be discarded'
          : 'This draft is being approved and cannot be discarded right now',
      });
    }

    // Atomic transition: the earlier status check above is only a
    // fast-path early return for the common case - the actual safety
    // guarantee is here. A concurrent approval request's atomic claim
    // (approveInvoiceDraft) could commit status:'approving'/'processing'/
    // 'approved' between this function's read above and this write;
    // without re-checking the condition as part of the SAME atomic
    // operation, this save() would silently overwrite that approval back
    // to 'discarded', stranding an already-created (or in-flight) Invoice
    // with a draft that no longer reflects it.
    const updated = await InvoiceDraft.findOneAndUpdate(
      { _id: draft._id, ownerId: draft.ownerId, status: { $nin: ['approved', 'approving', 'processing'] } },
      { $set: { status: 'discarded', expiresAt: new Date(Date.now() + 60 * 60 * 1000) }, $inc: { __v: 1 } },
      { new: true }
    );
    if (!updated) {
      return res.status(409).json({
        message: 'Approved drafts cannot be discarded',
      });
    }

    return res.json({ message: 'Draft discarded' });
  } catch (error) {
    return serverError(res, 'Failed to discard draft');
  }
};

/**
 * Stream the source timesheet to the preview window.
 *
 * The window needs the original document beside the table, and it cannot be
 * given a raw storage path: on the r2 driver that is an object key, and on
 * local it is a path outside any static mount. This proxies the bytes through
 * the authenticated API instead.
 */
export const getDraftSourceFile = async (req, res) => {
  try {
    const draft = await loadOwnedDraft(req, res);
    if (!draft) return undefined;

    const fileRecord = await FileRecord.findById(draft.sourceFileId);
    if (!fileRecord) {
      return res.status(404).json({ message: 'Source timesheet not found' });
    }

    const { driver, key } = resolveStorageRef(fileRecord);
    const tempFile = await downloadToTempFile({ key, driver });

    res.setHeader('Content-Type', fileRecord.mimeType || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${String(fileRecord.originalName || 'timesheet.pdf').replace(/["\r\n]/g, '_')}"`
    );

    return res.sendFile(tempFile.path, async () => {
      await tempFile.cleanup();
    });
  } catch (error) {
    return serverError(res, 'Failed to load source timesheet');
  }
};