import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';
import {
  recompute,
  buildEditedMap,
  formatMoney,
  formatNumber,
  toNumber,
  REVIEW_REASON_LABELS,
} from '../lib/invoiceCalc';
import { useInvoiceDraftPoll } from '../hooks/useInvoiceDraftPoll';
import { useSaveInvoiceDraftMutation, useApproveInvoiceDraftMutation } from '../hooks/mutations/useInvoiceDraftMutations';

/**
 * InvoicePreviewWindow
 *
 * The review step between extraction and PDF. Timesheet on the left, the
 * invoice that will be printed on the right, editable.
 *
 * Design intent: this screen has one job, which is to get the reader's eye to
 * the wrong number. Everything is quiet except two signals - amber means the
 * extractor was unsure, a pine rule means you changed it. Every figure is set
 * in tabular monospace and right-aligned, so a misplaced decimal shows up as a
 * ragged edge in the column before anyone has read the digits.
 *
 * Two ways to use this component:
 *
 * 1. EMBEDDED (the default now) - rendered inline by GenerateTaxInvoice as
 *    one of its dialog phases. Pass `draftId`, `onApproved`, and `onClose`
 *    as props. No route, no popup window, no window.opener - approval calls
 *    onApproved(...) directly and the parent decides what happens next (its
 *    own success screen), which is also what makes approval close itself
 *    automatically instead of leaving a stray window/panel open.
 *
 * 2. STANDALONE - still mountable at /invoice-preview/:draftId for anything
 *    that still opens it as a popup window. Falls back to useParams() for
 *    the draft id and to window.opener/window.close() when no onApproved/
 *    onClose props are given.
 */

const AUTOSAVE_DELAY_MS = 900;

const COLUMNS = [
  { key: 'project_id', label: 'Project', width: '11%', type: 'text' },
  { key: 'trade', label: 'Trade', width: '26%', type: 'text' },
  { key: 'hours', label: 'Hours', width: '13%', type: 'number', dp: 2 },
  { key: 'rate', label: 'Rate', width: '13%', type: 'number', dp: 2 },
  { key: 'amount', label: 'Amount', width: '17%', type: 'number', dp: 2 },
];

export default function InvoicePreviewWindow({
  draftId: draftIdProp,
  embedded = false,
  onApproved: onApprovedProp,
  onClose: onCloseProp,
} = {}) {
  const params = useParams();
  const draftId = draftIdProp || params.draftId;

  const [status, setStatus] = useState('loading');
  // Closure-pass finding: the 'approved' success screen below (status ===
  // 'approved') reads `approved.invoiceNumber`/`approved.invoiceId`, but no
  // `approved` variable was ever declared in this file - a plain
  // ReferenceError on every render of that branch. A prior pass here had
  // already found and removed a dangling `setApproved(...)` call (see the
  // comment near the polling effect below) believing it was dead/broken
  // code, but missed that the JSX still reads the value it would have set.
  // Restored as real state, populated at both places status is set to
  // 'approved' below.
  const [approved, setApproved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [draftVersion, setDraftVersion] = useState(null);
  const [staleConflict, setStaleConflict] = useState(null); // { currentVersion } | null
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [sourceUrl, setSourceUrl] = useState(null);
  const [sourceName, setSourceName] = useState('');
  const [splitPercent, setSplitPercent] = useState(48);
  const [focusedCell, setFocusedCell] = useState(null);
  const [approving, setApproving] = useState(false);
  // Raw text currently being typed into a numeric cell, keyed by "row-col"
  // (grid) or a fixed id (deduction amount / VAT %). While a cell has an
  // entry here, that string - not the recomputed/rounded model value - is
  // what the input shows. Without this, every keystroke ran recompute(),
  // which rounds and reformats the number, snapping the input's value and
  // the cursor position mid-type - typing "331.5" would land as "3.05"
  // because React kept resetting the field out from under the keystrokes.
  // The entry is cleared on blur, at which point the formatted, recomputed
  // value takes back over.
  const [cellDrafts, setCellDrafts] = useState({});

  const saveTimer = useRef(null);
  const dirtyRef = useRef(false);
  const hasSeededDraftRef = useRef(false);
  const hasNotifiedApprovalRef = useRef(false);

  const close = useCallback(() => {
    if (onCloseProp) {
      onCloseProp();
    } else if (typeof window !== 'undefined') {
      window.close();
    }
  }, [onCloseProp]);

  // ---- load & poll ------------------------------------------------------
  // useInvoiceDraftPoll (React Query, refetchInterval) replaces the
  // original's hand-rolled recursive setTimeout poll loop - it owns the
  // "poll every 2s while extracting, stop once resolved" timer/cleanup.
  // This effect just reacts to the query's data/error the same way the
  // original's poll() function body did.
  //
  // Bug fix: this block must come before handleReloadStaleDraft below -
  // that callback's dependency array reads `refetchDraft`, and a `const`
  // is only initialized when its declaration statement actually runs
  // (temporal dead zone applies at the statement level, not per-render
  // "eventually defined somewhere in this function"). With
  // handleReloadStaleDraft declared first, `[refetchDraft]` was evaluated
  // during render before this line ever ran, throwing "Cannot access
  // 'refetchDraft' before initialization" - not a stale-closure or
  // dependency-array bug, a plain declaration-order bug.
  const { data: pollResponse, error: pollError, refetch: refetchDraft } = useInvoiceDraftPoll(draftId);
  const saveDraftMutation = useSaveInvoiceDraftMutation(draftId);
  const approveDraftMutation = useApproveInvoiceDraftMutation(draftId);

  const handleReloadStaleDraft = useCallback(() => {
    hasSeededDraftRef.current = false;
    dirtyRef.current = false;
    setStaleConflict(null);
    setSaveState('idle');
    setError(null);
    refetchDraft();
  }, [refetchDraft]);

  useEffect(() => {
    if (pollError) {
      setStatus('failed');
      setError(pollError.message);
      return;
    }
    if (!pollResponse) return;

    // Same double-unwrap as the original: draftApi.get() resolves to the
    // backend's {message, data: {...actual draft...}} body, and the
    // original read res.data into `d` - identical here.
    const d = pollResponse.data;

    setSourceName(d.sourceFileName || '');

    if (d.status === 'extracting') {
      setStatus('extracting');
      return;
    }
    if (d.status === 'failed') {
      setStatus('failed');
      setError(d.error || 'Extraction failed.');
      return;
    }
    // Approval is asynchronous (see invoiceDraft.controller.js's
    // approveInvoiceDraft + invoiceApproval.worker.js) - the draft sits
    // here while a BullMQ job does the actual recompute/render/save work
    // off the request thread. Must be checked before the 'ready'
    // fallthrough below, or an 'approving' draft would be treated as
    // ready-for-editing and briefly re-seed the edit form mid-approval.
    if (d.status === 'approving') {
      setStatus('approving');
      return;
    }
    if (d.status === 'approved') {
      if (onApprovedProp) {
        onApprovedProp({ invoiceId: d.invoiceId, payload: d.payload });
        return;
      }
      // Standalone popup: notify the opener and auto-close, same as the
      // synchronous approve() flow used to do inline - now reached via
      // polling instead, since approve() itself only gets a 202
      // (queued) response. Guarded to fire once: without the ref, every
      // subsequent poll tick while this window stays open post-approval
      // would re-post the message and re-schedule another window.close().
      if (!hasNotifiedApprovalRef.current) {
        hasNotifiedApprovalRef.current = true;
        window.opener?.postMessage(
          { type: 'crewio:invoice-approved', payload: { invoiceId: d.invoiceId, payload: d.payload } },
          window.location.origin
        );
        setTimeout(() => window.close(), 600);
      }
      setStatus('approved');
      // setApproved is now real state (see declaration above) - the JSX
      // success screen reads invoiceId/invoiceNumber off it. invoiceNumber
      // isn't a top-level field on the draft GET response
      // (invoiceDraft.controller.js:getInvoiceDraft), only invoiceId is -
      // it lives on the draft's own editable payload instead, same place
      // recompute() below reads other invoice fields from. Optional
      // chaining here means an absent value just falls back to the JSX's
      // existing "The invoice is ready." generic copy, not a crash.
      setApproved({ invoiceId: d.invoiceId, invoiceNumber: d.payload?.invoiceNumber });
      if (!hasSeededDraftRef.current) {
        setDraft(recompute(d.payload));
        setDraftVersion(d.version);
        hasSeededDraftRef.current = true;
      }
      return;
    }

    // status === 'ready'. Seeded only once (ref guard) - the original
    // relied on polling naturally stopping once ready to make this a
    // one-time assignment; that guarantee alone isn't quite enough once a
    // mutation-driven cache invalidation is a possibility (React Query's
    // own doing, not the original's), so this is now explicit rather
    // than implicit, closing a theoretical race where a later refetch
    // could otherwise overwrite an in-progress edit.
    if (!hasSeededDraftRef.current) {
      setDraft(recompute(d.payload));
      setDraftVersion(d.version);
      hasSeededDraftRef.current = true;
    }
    // A previous async approval attempt failed - the worker rolls the
    // draft back to 'ready' and records why (invoiceApproval.worker.js's
    // rollbackDraft) instead of returning the error directly to the
    // original request, since that request already got its 202 back
    // before the failure happened. Surfacing it here reuses the same
    // inline error banner a synchronous approve() failure already showed.
    if (d.error) {
      setError(d.error);
    }
    setStatus('ready');
  }, [pollResponse, pollError, onApprovedProp]);

  // Fetch the timesheet through the authenticated endpoint and hand the
  // viewer a blob URL. A plain src would drop the auth header.
  useEffect(() => {
    if (status !== 'ready' && status !== 'approved') return undefined;
    let objectUrl = null;
    let cancelled = false;

    (async () => {
      try {
        const response = await api.get(`/api/invoices/drafts/${draftId}/source`, {
          responseType: 'blob',
        });
        const blob = response.data;
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSourceUrl(objectUrl);
      } catch {
        /* the viewer shows its own fallback */
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [draftId, status]);

  // ---- editing ----------------------------------------------------------

  const applyEdit = useCallback((mutator) => {
    setDraft((current) => {
      if (!current) return current;
      const next = recompute(mutator(structuredClone(current)));
      dirtyRef.current = true;
      return next;
    });
  }, []);

  const setCell = useCallback(
    (rowId, key, value) => {
      applyEdit((d) => {
        const row = d.rows.find((r) => r.row_id === rowId);
        if (!row) return d;
        if (key === 'hours' || key === 'rate') {
          row[key] = toNumber(value);
          // Typing hours or rate hands the amount back to the formula, which
          // is what someone correcting a misread rate expects.
          row.amount_locked = false;
        } else if (key === 'amount') {
          row.amount = toNumber(value);
          // Typing an amount directly means the printed figure is the truth,
          // even where it does not divide evenly into the hours. Some
          // suppliers bill a lump sum per trade.
          row.amount_locked = true;
        } else {
          row[key] = value;
        }
        return d;
      });
    },
    [applyEdit]
  );

  const addRow = useCallback(() => {
    applyEdit((d) => {
      d.rows.push({
        row_id: crypto.randomUUID(),
        trade: '',
        project_id: '',
        description: '',
        hours: 0,
        rate: 0,
        amount: 0,
        amount_locked: false,
        employee_count: 0,
        source_employee_ids: [],
        confidence: 1,
        needs_review: false,
        review_reasons: [],
        user_added: true,
        removed: false,
      });
      return d;
    });
  }, [applyEdit]);

  const toggleRemoveRow = useCallback(
    (rowId) => {
      applyEdit((d) => {
        const row = d.rows.find((r) => r.row_id === rowId);
        if (row) row.removed = !row.removed;
        return d;
      });
    },
    [applyEdit]
  );

  const setDeduction = useCallback(
    (lineId, field, value) => {
      applyEdit((d) => {
        const line = d.deduction_lines.find((l) => l.line_id === lineId);
        if (!line) return d;
        line[field] = field === 'amount' ? toNumber(value) : value;
        return d;
      });
    },
    [applyEdit]
  );

  const addDeduction = useCallback(() => {
    applyEdit((d) => {
      d.deduction_lines.push({
        line_id: crypto.randomUUID(),
        label: '',
        amount: 0,
        user_added: true,
        removed: false,
      });
      return d;
    });
  }, [applyEdit]);

  const removeDeduction = useCallback(
    (lineId) => {
      applyEdit((d) => {
        d.deduction_lines = d.deduction_lines.filter((l) => l.line_id !== lineId);
        return d;
      });
    },
    [applyEdit]
  );

  // ---- autosave ---------------------------------------------------------

  useEffect(() => {
    if (!draft || !dirtyRef.current || status !== 'ready') return undefined;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');

    saveTimer.current = setTimeout(async () => {
      try {
        const res = await saveDraftMutation.mutateAsync({ payload: draft, expectedVersion: draftVersion });
        // Take the server's numbers back. If the two calculators ever
        // disagree, this is where the browser gives way.
        setDraft(recompute(res.data.payload));
        setDraftVersion(res.data.version);
        dirtyRef.current = false;
        setSaveState('saved');
      } catch (err) {
        if (err?.response?.status === 409 && err?.response?.data?.currentVersion !== undefined) {
          // Someone else (another reviewer, another tab) edited this
          // draft since we loaded it. Don't silently overwrite their
          // change by retrying, and don't silently discard the user's
          // own in-progress edit either - surface it and let them choose.
          setSaveState('error');
          setStaleConflict({ currentVersion: err.response.data.currentVersion });
          return;
        }
        setSaveState('error');
        setError(err.message);
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, draftId, status, draftVersion]);

  // Warn before closing with unsaved edits in flight.
  useEffect(() => {
    const handler = (event) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ---- approve ----------------------------------------------------------

  // Manual fallback poll for the 'approving' phase. useInvoiceDraftPoll's
  // refetchInterval decides whether to keep polling purely off React
  // Query's own cache state, and only reliably re-arms itself after a
  // state change that came from an actual fetch - not after a synthetic
  // queryClient.setQueryData() write (confirmed in production: the cache
  // can be told the status is 'approving', but the interval timer that's
  // supposed to react to that never restarts, so the query is never
  // fetched again). A fresh mount of this same component picks up the
  // real 'approved' status from the server instantly, proving the bug is
  // purely "nothing ever asks again", not stale/incorrect data. This loop
  // is the "ask again" - it calls refetchDraft() directly on a plain
  // timer, independent of refetchInterval, until the poll effect above
  // observes a non-approving status and this component re-renders out of
  // the 'approving' branch.
  const approvalPollActiveRef = useRef(false);

  useEffect(() => () => { approvalPollActiveRef.current = false; }, []);

  const pollApprovalUntilResolved = useCallback(async () => {
    approvalPollActiveRef.current = true;
    while (approvalPollActiveRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (!approvalPollActiveRef.current) return;
      let result;
      try {
        result = await refetchDraft();
      } catch {
        continue; // transient network error - keep polling
      }
      const latestStatus = result?.data?.data?.status;
      if (latestStatus !== 'approving' && latestStatus !== 'processing') {
        approvalPollActiveRef.current = false;
        return;
      }
    }
  }, [refetchDraft]);

  const approve = useCallback(async () => {
    if (!draft) return;
    setApproving(true);
    setError(null);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // Approval is now asynchronous - this call only returns once the
      // backend's atomic claim has committed and a BullMQ job has been
      // enqueued (202, {status: 'approving'}), not once the invoice
      // actually exists (see invoiceDraft.controller.js's
      // approveInvoiceDraft). The real "it's done" signal - for both the
      // embedded and standalone cases - now comes from the polling effect
      // above once it observes status 'approved', not from this response.
      await approveDraftMutation.mutateAsync({ payload: draft, expectedVersion: draftVersion });
      dirtyRef.current = false;
      setStatus('approving');
      pollApprovalUntilResolved();
    } catch (err) {
      if (err?.response?.status === 409 && err?.response?.data?.currentVersion !== undefined) {
        // Someone else edited this draft since it was loaded. Do not
        // auto-approve based on what's now a stale view of the data -
        // require the user to explicitly reload and re-review.
        setStaleConflict({ currentVersion: err.response.data.currentVersion });
      } else {
        setError(err.message);
      }
    } finally {
      setApproving(false);
    }
  }, [draft, draftId, draftVersion, onApprovedProp, approveDraftMutation, pollApprovalUntilResolved]);

  // ---- derived ----------------------------------------------------------

  const rows = useMemo(() => (draft?.rows || []).filter((r) => !r.removed), [draft]);
  const removedRows = useMemo(() => (draft?.rows || []).filter((r) => r.removed), [draft]);
  const editedMap = useMemo(() => (draft ? buildEditedMap(draft) : new Set()), [draft]);
  const flaggedRows = useMemo(() => rows.filter((r) => r.needs_review), [rows]);
  const totals = draft?.totals || {};
  const currency = draft?.meta?.currency || 'AED';
  const blockingIssues = draft?.blocking_issues || [];

  const jumpToFirstFlag = useCallback(() => {
    const first = flaggedRows[0];
    if (!first) return;
    const el = document.querySelector(`[data-row="${first.row_id}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.querySelector('input')?.focus();
  }, [flaggedRows]);

  // ---- grid keyboard navigation ----------------------------------------

  const handleCellKeyDown = (event, rowIndex, colIndex) => {
    const move = (dr, dc) => {
      event.preventDefault();
      const r = Math.min(Math.max(rowIndex + dr, 0), rows.length - 1);
      const c = Math.min(Math.max(colIndex + dc, 0), COLUMNS.length - 1);
      const selector = `[data-cell="${r}-${c}"] input`;
      document.querySelector(selector)?.focus();
      document.querySelector(selector)?.select();
      setFocusedCell(`${r}-${c}`);
    };

    if (event.key === 'ArrowDown' || event.key === 'Enter') move(1, 0);
    else if (event.key === 'ArrowUp') move(-1, 0);
    else if (event.key === 'Tab' && !event.shiftKey && colIndex === COLUMNS.length - 1) {
      move(1, -(COLUMNS.length - 1));
    }
  };

  /**
   * Paste a block copied straight out of Excel.
   *
   * Anyone reconciling invoices has the supplier's own workbook open. Letting
   * them paste a corrected block in one go is the difference between this
   * screen being faster than Excel and being a slower version of it.
   */
  const handlePaste = (event, rowIndex, colIndex) => {
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text.includes('\t') && !text.includes('\n')) return; // single value, let it through

    event.preventDefault();
    const matrix = text
      .replace(/\r/g, '')
      .split('\n')
      .filter((line) => line.length)
      .map((line) => line.split('\t'));

    applyEdit((d) => {
      const live = d.rows.filter((r) => !r.removed);
      matrix.forEach((line, dr) => {
        const target = live[rowIndex + dr];
        if (!target) return;
        line.forEach((value, dc) => {
          const col = COLUMNS[colIndex + dc];
          if (!col) return;
          if (col.type === 'number') {
            target[col.key] = toNumber(value);
            if (col.key === 'amount') target.amount_locked = true;
            else target.amount_locked = false;
          } else {
            target[col.key] = value.trim();
          }
        });
      });
      return d;
    });
  };

  // ---- splitter ---------------------------------------------------------

  const startDrag = (event) => {
    event.preventDefault();
    const onMove = (e) => {
      const pct = (e.clientX / window.innerWidth) * 100;
      setSplitPercent(Math.min(Math.max(pct, 24), 76));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ---- render -----------------------------------------------------------

  if (status === 'loading' || status === 'extracting') {
    return (
      <Shell embedded={embedded}>
        <div className="ip-center">
          <div className="ip-pulse" aria-hidden />
          <h1 className="ip-center-title">Reading the timesheet</h1>
          <p className="ip-center-body">
            {sourceName || 'Your document'} is being extracted. This usually takes under a
            minute. {embedded ? 'Stay on this screen.' : 'You can leave this window open.'}
          </p>
        </div>
      </Shell>
    );
  }

  if (status === 'approving') {
    return (
      <Shell embedded={embedded}>
        <div className="ip-center">
          <div className="ip-pulse" aria-hidden />
          <h1 className="ip-center-title">Generating your invoice</h1>
          <p className="ip-center-body">
            Recomputing totals and rendering the PDF. This usually takes a few seconds.{' '}
            {embedded ? 'Stay on this screen.' : 'You can leave this window open.'}
          </p>
        </div>
      </Shell>
    );
  }

  if (status === 'failed') {
    return (
      <Shell embedded={embedded}>
        <div className="ip-center">
          <h1 className="ip-center-title">Extraction did not complete</h1>
          <p className="ip-center-body">{error}</p>
          <div className="ip-center-actions">
            <button
              className="ip-btn ip-btn-quiet"
              onClick={embedded ? close : () => window.location.reload()}
            >
              {embedded ? 'Close' : 'Try again'}
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (status === 'approved') {
    return (
      <Shell embedded={embedded}>
        <div className="ip-center">
          <h1 className="ip-center-title">Invoice generated</h1>
          <p className="ip-center-body">
            {approved?.invoiceNumber
              ? `${approved.invoiceNumber} is ready.`
              : 'The invoice is ready.'}{' '}
            You can close this window.
          </p>
          <div className="ip-center-actions">
            {approved?.invoiceId && (
              <a
                className="ip-btn"
                href={`/api/invoices/${approved.invoiceId}/download`}
                target="_blank"
                rel="noreferrer"
              >
                Open the PDF
              </a>
            )}
            <button className="ip-btn ip-btn-quiet" onClick={() => window.close()}>
              Close window
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell embedded={embedded}>
      <header className="ip-bar">
        <div className="ip-bar-left">
          <span className="ip-eyebrow">Review before generating</span>
          <h1 className="ip-title">{sourceName || 'Timesheet'}</h1>
          <div className="ip-meta">
            <span className="ip-chip">{draft?.source?.extraction_source || 'extracted'}</span>
            <span className="ip-chip">
              {formatNumber((draft?.source?.confidence || 0) * 100, 0)}% confidence
            </span>
            {draft?.meta?.period_month && (
              <span className="ip-chip">{draft.meta.period_month}</span>
            )}
          </div>
        </div>

        <div className="ip-bar-right">
          <SaveIndicator state={saveState} />
          <div className="ip-net">
            <span className="ip-net-label">Net payable</span>
            <span className="ip-net-value">{formatMoney(totals.net_total, currency)}</span>
          </div>
          {embedded && (
            <button
              className="ip-btn ip-btn-quiet"
              onClick={close}
              disabled={approving}
              title="Back out without generating the PDF"
            >
              Cancel
            </button>
          )}
          <button
            className="ip-btn ip-btn-primary"
            onClick={approve}
            disabled={approving || blockingIssues.length > 0 || saveState === 'saving' || Boolean(staleConflict)}
            title={blockingIssues.join(' ')}
          >
            {approving ? 'Generating...' : 'Approve and generate PDF'}
          </button>
        </div>
      </header>

      {flaggedRows.length > 0 && (
        <div className="ip-rail" role="status">
          <span className="ip-rail-dot" aria-hidden />
          <span>
            {flaggedRows.length} {flaggedRows.length === 1 ? 'line needs' : 'lines need'} a
            second look
          </span>
          <button className="ip-rail-link" onClick={jumpToFirstFlag}>
            Go to the first one
          </button>
        </div>
      )}

      {blockingIssues.length > 0 && (
        <div className="ip-block" role="alert">
          {blockingIssues.map((issue) => (
            <span key={issue}>{issue}</span>
          ))}
        </div>
      )}

      {staleConflict && status === 'ready' && (
        <div className="ip-block" role="alert">
          <span>
            This draft was updated elsewhere since you started reviewing it. Your unsaved changes
            cannot be saved or approved against the old version.
          </span>
          <button type="button" onClick={handleReloadStaleDraft} className="ip-btn">
            Reload latest draft
          </button>
        </div>
      )}

      {error && status === 'ready' && (
        <div className="ip-block" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div className="ip-split">
        <section className="ip-pane" style={{ width: `${splitPercent}%` }}>
          <div className="ip-pane-head">
            <h2>Uploaded timesheet</h2>
            {sourceUrl && (
              <a className="ip-pane-link" href={sourceUrl} target="_blank" rel="noreferrer">
                Open full size
              </a>
            )}
          </div>
          <div className="ip-doc">
            {sourceUrl ? (
              <object data={sourceUrl} type="application/pdf" className="ip-doc-frame">
                <iframe src={sourceUrl} title="Uploaded timesheet" className="ip-doc-frame" />
              </object>
            ) : (
              <p className="ip-doc-empty">Loading the document...</p>
            )}
          </div>
        </section>

        <div
          className="ip-divider"
          onMouseDown={startDrag}
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setSplitPercent((p) => Math.max(24, p - 2));
            if (e.key === 'ArrowRight') setSplitPercent((p) => Math.min(76, p + 2));
          }}
        />

        <section className="ip-pane ip-pane-edit" style={{ width: `${100 - splitPercent}%` }}>
          <div className="ip-pane-head">
            <h2>Invoice to be generated</h2>
            <span className="ip-pane-hint">
              Click any figure to change it. Paste from Excel works.
            </span>
          </div>

          <div className="ip-scroll">
            <table className="ip-grid">
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.key} style={{ width: col.width }} className={col.type === 'number' ? 'num' : ''}>
                      {col.label}
                    </th>
                  ))}
                  <th className="ip-grid-actions" aria-label="Row actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr
                    key={row.row_id}
                    data-row={row.row_id}
                    className={row.needs_review ? 'flagged' : ''}
                  >
                    {COLUMNS.map((col, colIndex) => {
                      const isEdited = editedMap.has(`${row.row_id}:${col.key}`);
                      const cellId = `${rowIndex}-${colIndex}`;
                      const flagged =
                        row.needs_review && reasonTouchesColumn(row.review_reasons, col.key);
                      return (
                        <td
                          key={col.key}
                          data-cell={cellId}
                          className={[
                            col.type === 'number' ? 'num' : '',
                            isEdited ? 'edited' : '',
                            flagged ? 'cell-flagged' : '',
                            focusedCell === cellId ? 'focused' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          title={flagged ? describeReasons(row.review_reasons) : undefined}
                        >
                          <input
                            value={
                              cellDrafts[cellId] !== undefined
                                ? cellDrafts[cellId]
                                : col.type === 'number'
                                  ? formatNumber(row[col.key], col.dp)
                                  : row[col.key] || ''
                            }
                            inputMode={col.type === 'number' ? 'decimal' : 'text'}
                            onChange={(e) => {
                              const raw = e.target.value;
                              // Keep the raw keystrokes on screen; recompute
                              // still runs on the model in the background so
                              // totals move live, but the formatted/rounded
                              // result no longer overwrites what's mid-type.
                              setCellDrafts((prev) => ({ ...prev, [cellId]: raw }));
                              setCell(row.row_id, col.key, raw);
                            }}
                            onFocus={(e) => {
                              setFocusedCell(cellId);
                              setCellDrafts((prev) => ({
                                ...prev,
                                [cellId]: col.type === 'number'
                                  ? String(row[col.key] ?? '')
                                  : row[col.key] || '',
                              }));
                              e.target.select();
                            }}
                            onBlur={() => {
                              setCellDrafts((prev) => {
                                if (!(cellId in prev)) return prev;
                                const next = { ...prev };
                                delete next[cellId];
                                return next;
                              });
                            }}
                            onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
                            onPaste={(e) => handlePaste(e, rowIndex, colIndex)}
                            aria-label={`${col.label}, row ${rowIndex + 1}`}
                          />
                          {col.key === 'amount' && row.amount_locked && (
                            <span className="ip-lock" title="Typed directly, not derived from hours x rate">
                              fixed
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="ip-grid-actions">
                      <button
                        className="ip-icon"
                        onClick={() => toggleRemoveRow(row.row_id)}
                        aria-label={`Remove line ${rowIndex + 1}`}
                        title="Remove this line"
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button className="ip-add" onClick={addRow}>
              Add a line
            </button>

            {removedRows.length > 0 && (
              <div className="ip-removed">
                <span>
                  {removedRows.length} removed {removedRows.length === 1 ? 'line' : 'lines'}
                </span>
                {removedRows.map((row) => (
                  <button
                    key={row.row_id}
                    className="ip-removed-item"
                    onClick={() => toggleRemoveRow(row.row_id)}
                  >
                    Restore {row.trade || 'untitled'}
                  </button>
                ))}
              </div>
            )}

            <div className="ip-section">
              <h3>Deductions</h3>
              <table className="ip-grid ip-grid-slim">
                <tbody>
                  {(draft?.deduction_lines || [])
                    .filter((l) => !l.removed)
                    .map((line) => (
                      <tr key={line.line_id}>
                        <td>
                          <input
                            value={line.label}
                            placeholder="What is this deduction for?"
                            onChange={(e) => setDeduction(line.line_id, 'label', e.target.value)}
                            aria-label="Deduction label"
                          />
                        </td>
                        <td className="num">
                          <input
                            value={
                              cellDrafts[`ded:${line.line_id}`] !== undefined
                                ? cellDrafts[`ded:${line.line_id}`]
                                : formatNumber(line.amount)
                            }
                            inputMode="decimal"
                            onChange={(e) => {
                              const raw = e.target.value;
                              setCellDrafts((prev) => ({ ...prev, [`ded:${line.line_id}`]: raw }));
                              setDeduction(line.line_id, 'amount', raw);
                            }}
                            onFocus={(e) => {
                              setCellDrafts((prev) => ({
                                ...prev,
                                [`ded:${line.line_id}`]: String(line.amount ?? ''),
                              }));
                              e.target.select();
                            }}
                            onBlur={() => {
                              setCellDrafts((prev) => {
                                const key = `ded:${line.line_id}`;
                                if (!(key in prev)) return prev;
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                            }}
                            aria-label="Deduction amount"
                          />
                        </td>
                        <td className="ip-grid-actions">
                          <button
                            className="ip-icon"
                            onClick={() => removeDeduction(line.line_id)}
                            aria-label="Remove deduction"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <button className="ip-add" onClick={addDeduction}>
                Add a deduction
              </button>
            </div>
          </div>

          <footer className="ip-totals">
            <TotalRow label="Subtotal" value={formatMoney(totals.subtotal, currency)} />
            <TotalRow
              label="Deductions"
              value={`- ${formatMoney(totals.deductions, currency)}`}
            />
            <TotalRow
              label="Gross Total"
              value={formatMoney(totals.adjusted_subtotal, currency)}
              className="gross-total"
            />
            <div className="ip-total-row">
              <span className="ip-total-label">
                VAT
                <input
                  className="ip-vat"
                  value={
                    cellDrafts.vat !== undefined
                      ? cellDrafts.vat
                      : formatNumber((totals.vat_rate || 0) * 100, 2)
                  }
                  inputMode="decimal"
                  onChange={(e) => {
                    const raw = e.target.value;
                    setCellDrafts((prev) => ({ ...prev, vat: raw }));
                    applyEdit((d) => {
                      d.vat_rate = toNumber(raw) / 100;
                      return d;
                    });
                  }}
                  onFocus={(e) => {
                    setCellDrafts((prev) => ({
                      ...prev,
                      vat: formatNumber((totals.vat_rate || 0) * 100, 2),
                    }));
                    e.target.select();
                  }}
                  onBlur={() => {
                    setCellDrafts((prev) => {
                      if (!('vat' in prev)) return prev;
                      const next = { ...prev };
                      delete next.vat;
                      return next;
                    });
                  }}
                  aria-label="VAT percentage"
                />
                %
              </span>
              <span className="ip-total-value">{formatMoney(totals.vat, currency)}</span>
            </div>
            <TotalRow
              label="Net payable"
              value={formatMoney(totals.net_total, currency)}
              emphasis
              className="net-payable"
            />
          </footer>
        </section>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------

const reasonTouchesColumn = (reasons = [], key) => {
  const map = {
    hours: ['missing_hours', 'amount_mismatch'],
    rate: ['missing_rate', 'amount_mismatch'],
    amount: ['amount_mismatch'],
    trade: ['missing_trade'],
  };
  if (reasons.includes('low_confidence')) return true;
  return (map[key] || []).some((r) => reasons.includes(r));
};

const describeReasons = (reasons = []) =>
  reasons.map((r) => REVIEW_REASON_LABELS[r] || r).join('. ');

const TotalRow = ({ label, value, emphasis, className = '' }) => (
  <div className={`ip-total-row${emphasis ? ' emphasis' : ''}${className ? ` ${className}` : ''}`}>
    <span className="ip-total-label">{label}</span>
    <span className="ip-total-value">{value}</span>
  </div>
);

const SaveIndicator = ({ state }) => {
  const copy = {
    idle: 'No changes',
    saving: 'Saving',
    saved: 'Saved',
    error: 'Not saved',
  }[state];
  return (
    <span className={`ip-save ip-save-${state}`} role="status">
      {copy}
    </span>
  );
};

const Shell = ({ children, embedded }) => (
  <div className={embedded ? 'ip-root ip-root-embedded' : 'ip-root'}>
    <style>{styles}</style>
    {children}
  </div>
);

const styles = `
.ip-root {
  /* Every color/shadow/radius below is one of this project's own design
     tokens (src/styles/variables.css), not an invented palette - so this
     screen reads as part of the same app, not a bolted-on tool. */
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-canvas);
  color: var(--text-primary);
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}

/* Embedded mode: rendered inline inside GenerateTaxInvoice's dialog-phase
   system instead of a separate popup window. FlowTopbar is 72px and sits in
   normal document flow (not itself fixed), so "top: 0" here would slide
   underneath it - offsetting to 72px is what keeps the topbar visible above
   this stage. z-index matches the app's own DialogShell (1400) so this
   layers the same way the existing generation dialog does. */
.ip-root-embedded {
  top: 72px;
  z-index: 1400;
  box-shadow: var(--shadow-popover);
}

.ip-root *, .ip-root *::before, .ip-root *::after { box-sizing: border-box; }

/* ---- top bar ---- */
.ip-bar {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 24px;
  padding: 16px 40px 14px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-card);
}
.ip-eyebrow {
  display: block;
  font-size: 12px; letter-spacing: 0.02em; text-transform: uppercase;
  color: var(--text-secondary); font-weight: 600;
}
.ip-title { margin: 4px 0 8px; font-size: 20px; font-weight: 600; color: var(--text-primary); }
.ip-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.ip-chip {
  font-size: 12px;
  padding: 3px 9px; border: 1px solid var(--border-card); border-radius: 6px;
  color: var(--text-secondary); background: var(--bg-surface-secondary);
}
.ip-bar-right { display: flex; align-items: center; gap: 20px; }

.ip-net { text-align: right; }
.ip-net-label {
  display: block; font-size: 12px;
  color: var(--text-secondary); font-weight: 500;
}
.ip-net-value {
  display: block; font-size: 20px; font-weight: 700;
  font-variant-numeric: tabular-nums; color: var(--text-primary);
}

.ip-save { font-size: 12px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.ip-save-saving { color: var(--color-warning); }
.ip-save-saved { color: var(--color-success); }
.ip-save-error { color: var(--color-error); font-weight: 600; }

/* ---- buttons: same shape/weight/radius as componentTokens.button ---- */
.ip-btn {
  font-family: inherit; font-weight: 500; font-size: 14px;
  padding: 10px 20px; border-radius: 8px; border: 1px solid transparent;
  cursor: pointer; text-decoration: none; display: inline-block;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}
.ip-btn-primary {
  background: var(--color-primary); border-color: var(--color-primary); color: var(--color-primary-contrast);
}
.ip-btn-primary:hover { background: var(--color-primary-hover); border-color: var(--color-primary-hover); }
.ip-btn-primary:active { background: var(--color-primary-active); }
.ip-btn-primary:disabled {
  background: var(--border-card-hover); border-color: var(--border-card-hover);
  color: var(--color-primary-contrast); cursor: not-allowed;
}
.ip-btn-quiet {
  background: var(--bg-surface); border-color: var(--color-primary); color: var(--color-primary);
}
.ip-btn-quiet:hover { background: var(--bg-info-soft); }
.ip-btn:focus-visible, .ip-icon:focus-visible, .ip-add:focus-visible,
.ip-grid input:focus-visible, .ip-divider:focus-visible {
  outline: none; box-shadow: var(--focus-ring);
}

/* ---- the review rail: uses the app's own warning tokens ---- */
.ip-rail {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 40px;
  background: var(--bg-warning-soft);
  border-bottom: 1px solid var(--border-card);
  font-size: 13px; color: var(--color-warning);
}
.ip-rail-dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--color-warning); flex: none;
}
.ip-rail-link {
  font: inherit; font-weight: 600; color: var(--color-warning);
  background: none; border: none; padding: 0; cursor: pointer;
  text-decoration: underline; text-underline-offset: 2px;
}

.ip-block {
  display: flex; flex-wrap: wrap; gap: 14px;
  padding: 8px 40px; background: var(--bg-error-soft);
  border-bottom: 1px solid var(--border-card); font-size: 13px; color: var(--color-error);
}

/* ---- split ---- */
.ip-split { flex: 1; display: flex; min-height: 0; }
.ip-pane { display: flex; flex-direction: column; min-width: 0; background: var(--bg-surface); }
.ip-pane-edit { border-left: none; }

.ip-divider {
  width: 5px; flex: none; cursor: col-resize; background: var(--border-card);
  border: none; padding: 0;
}
.ip-divider:hover { background: var(--border-card-hover); }

.ip-pane-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  padding: 10px 40px; border-bottom: 1px solid var(--border-card); background: var(--bg-canvas);
}
.ip-pane-head h2 {
  margin: 0; font-size: 12px; font-weight: 600;
  letter-spacing: 0.02em; text-transform: uppercase; color: var(--text-secondary);
}
.ip-pane-hint, .ip-pane-link { font-size: 12px; color: var(--text-secondary); }
.ip-pane-link { color: var(--color-primary); text-decoration: underline; text-underline-offset: 2px; }

.ip-doc { flex: 1; min-height: 0; background: var(--bg-surface-tertiary); }
.ip-doc-frame { width: 100%; height: 100%; border: none; display: block; }
.ip-doc-empty { padding: 32px; text-align: center; color: var(--text-secondary); }

.ip-scroll { flex: 1; min-height: 0; overflow: auto; padding: 0 40px 24px; }

/* ---- grid: right-aligned, tabular figures on numbers so a stray decimal
       shows up as a ragged column edge before you read the digits ---- */
.ip-grid { width: 100%; border-collapse: collapse; }
.ip-grid th {
  position: sticky; top: 0; z-index: 2;
  text-align: left; font-size: 12px; font-weight: 600;
  color: var(--text-secondary);
  padding: 10px 12px; background: var(--bg-surface);
  border-bottom: 1px solid var(--border-card-hover);
}
.ip-grid th.num { text-align: right; }
.ip-grid td {
  padding: 0; border-bottom: 1px solid var(--border-card); position: relative;
  border-left: 2px solid transparent;
}
.ip-grid input {
  width: 100%; border: none; background: transparent; font: inherit;
  padding: 9px 12px; color: inherit;
}
.ip-grid td.num input {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.ip-grid tr:hover td { background: var(--bg-surface-secondary); }
.ip-grid td.focused { background: var(--bg-info-soft) !important; }

.ip-grid tr.flagged td.cell-flagged { background: var(--bg-warning-soft); }
.ip-grid tr.flagged td.cell-flagged.focused { background: var(--bg-info-soft) !important; }
.ip-grid td.edited { border-left-color: var(--color-primary); }

.ip-lock {
  position: absolute; right: 12px; bottom: 2px;
  font-size: 9px; letter-spacing: 0.04em;
  color: var(--text-tertiary); text-transform: uppercase; pointer-events: none;
}

.ip-grid-actions { width: 34px; text-align: center; }
.ip-icon {
  font: inherit; font-size: 16px; line-height: 1;
  background: none; border: none; color: var(--text-tertiary);
  cursor: pointer; padding: 4px 6px;
}
.ip-icon:hover { color: var(--color-error); }

.ip-add {
  margin: 10px 0 0; font: inherit; font-size: 13px; font-weight: 500;
  background: none; border: 1px dashed var(--border-card-hover); border-radius: 8px;
  padding: 7px 14px; color: var(--text-secondary); cursor: pointer;
}
.ip-add:hover { border-color: var(--color-primary); color: var(--color-primary); }

.ip-removed {
  margin: 14px 0 0; padding: 9px 12px;
  border: 1px solid var(--border-card); border-radius: 8px;
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  font-size: 12px; color: var(--text-secondary);
}
.ip-removed-item {
  font: inherit; background: none; border: none; padding: 0;
  color: var(--color-primary); cursor: pointer;
  text-decoration: underline; text-underline-offset: 2px;
}

.ip-section { margin-top: 26px; }
.ip-section h3 {
  margin: 0 0 4px; font-size: 12px; font-weight: 600;
  letter-spacing: 0.02em; text-transform: uppercase; color: var(--text-secondary);
}
.ip-grid-slim td { border-bottom: 1px solid var(--border-card); }

/* ---- totals ---- */
.ip-totals {
  border-top: 1px solid var(--border-card-hover); background: var(--bg-canvas);
  padding: 12px 40px 14px;
}
.ip-total-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 0; font-size: 14px;
}
.ip-total-label { color: var(--text-secondary); display: flex; align-items: center; gap: 4px; }
.ip-total-value {
  font-variant-numeric: tabular-nums; color: var(--text-primary);
}
.ip-total-row.emphasis {
  margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--border-card-hover);
  font-size: 17px; font-weight: 700;
}
.ip-total-row.emphasis .ip-total-label { color: var(--text-primary); }

.ip-total-row.gross-total {
  margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--border-card-hover);
  font-weight: 700;
}
.ip-total-row.gross-total .ip-total-label,
.ip-total-row.gross-total .ip-total-value { color: #141414; }

.ip-total-row.net-payable .ip-total-label,
.ip-total-row.net-payable .ip-total-value { color: #1D4ED8; }

.ip-vat {
  width: 48px; font: inherit;
  text-align: right; padding: 2px 5px;
  border: 1px solid var(--border-input); border-radius: 6px; background: var(--bg-surface);
}
.ip-vat:focus-visible { outline: none; box-shadow: var(--focus-ring); border-color: var(--border-input-focus); }

/* ---- states ---- */
.ip-center {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 12px;
  padding: 40px; text-align: center;
}
.ip-center-title { margin: 0; font-size: 20px; font-weight: 600; color: var(--text-primary); }
.ip-center-body { margin: 0; max-width: 46ch; color: var(--text-secondary); line-height: 1.55; }
.ip-center-actions { display: flex; gap: 10px; margin-top: 8px; }
.ip-pulse {
  width: 30px; height: 3px; background: var(--color-primary); border-radius: 2px;
  animation: ip-breathe 1.5s ease-in-out infinite;
}
@keyframes ip-breathe {
  0%, 100% { opacity: 0.25; transform: scaleX(0.5); }
  50% { opacity: 1; transform: scaleX(1); }
}

@media (prefers-reduced-motion: reduce) {
  .ip-root * { animation: none !important; transition: none !important; }
}

@media (max-width: 900px) {
  .ip-split { flex-direction: column; }
  .ip-pane { width: 100% !important; height: 50%; }
  .ip-divider { width: 100%; height: 5px; cursor: row-resize; }
  .ip-bar { flex-direction: column; align-items: stretch; gap: 12px; }
  .ip-bar-right { justify-content: space-between; }
}
`;