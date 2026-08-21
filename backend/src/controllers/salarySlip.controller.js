import SalarySlip from '../models/SalarySlip.js'
import { serverError } from '../utils/apiResponse.js';
import Employee from '../models/Employee.js'
import InvoiceCounter from '../models/InvoiceCounter.js'
import Notification from '../models/Notification.js'
import { generateSalarySlipPdfBuffer } from '../services/Salaryslipjspdf.service.js'
import { objectExists, getObjectBuffer, saveBuffer, buildTenantKey } from '../services/storage.service.js'
import { createAuditLog } from '../services/audit.service.js'
import { sendPushToEmployee } from '../services/push.service.js'
import { syncSalarySlipExpenseRecords } from '../services/expenseHistorySync.service.js'
import { cacheGetOrSet, cacheInvalidate } from '../utils/cache.util.js'
import { employeeCachePrefix } from './employee.controller.js'

// Escapes regex metacharacters before interpolating client-controlled text
// into a MongoDB $regex filter. Without this, a crafted month value could
// either alter the match semantics (e.g. ".*" matching every month instead
// of an exact one) or, with nested quantifiers, cause catastrophic
// backtracking on the shared MongoDB instance (a cross-tenant DoS risk,
// even though the query itself stays correctly tenant-scoped).
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const salarySlipCachePrefix = (ownerId) => `salarySlips:${ownerId}:`;

// Create a salary slip. Office/owner-only (see D19.2/D19.3 finding below) -
// the caller must provide `employeeId` in the body.
export const createSalarySlip = async (req, res) => {
  try {
    // This route is registered behind authenticateDual (see
    // salarySlip.routes.js), so it is reachable with a valid employee
    // token, not just an owner/admin token. Salary-slip CREATE previously
    // took baseSalary/allowances/deductions/netSalary/status/slipData
    // directly from req.body with no validation for either caller type -
    // combined with employeeId always being forced to the caller's own
    // employee record when authenticated via an employee token, this let
    // an employee author their own payroll record with arbitrary,
    // self-declared earnings and an arbitrary status (e.g. 'paid'), fully
    // attributed to themselves. No current client (web or mobile) ever
    // exercises employee-token creation - confirmed no employee-reachable
    // UI calls POST /api/salary-slips - but the route remains registered
    // and reachable by any authenticated employee. Reject outright, the
    // same pattern already used by updateSalarySlip (below) and
    // updateInvoice (invoice.controller.js) for the identical class of
    // issue.
    if (req.employee) return res.status(403).json({ message: 'Forbidden' })

    const payload = req.body || {}

    let employeeId = null
    if (req.user && req.user.role === 'employee') {
      employeeId = req.user.employeeId
    } else if (payload.employeeId) {
      employeeId = payload.employeeId
    }

    if (!employeeId) return res.status(400).json({ message: 'employeeId is required' })

    let ownerId = req.employee?.ownerId || req.user?.ownerId || req.user?.userId || null
    if (!ownerId) return res.status(401).json({ message: 'User not authenticated' })
    const ownershipClauses = []
    if (ownerId) ownershipClauses.push({ ownerId }, { owner: ownerId })
    if (req.user?.companyId) ownershipClauses.push({ company: req.user.companyId })

    const employeeLookup = {
      $and: [
        { $or: [{ _id: employeeId }, { employeeId: employeeId }] },
        ownershipClauses.length ? { $or: ownershipClauses } : {},
      ].filter(Boolean),
    }
    const employee = await Employee.findOne(employeeLookup)
    if (!employee) return res.status(404).json({ message: 'Employee not found' })

    // NOTE: previously there was an additional check here comparing
    // employee.company (the employee's assigned CLIENT company/site)
    // against req.user.companyId (the owner's own auto-created internal
    // invoicing company). Those can never legitimately match, so this
    // silently 403'd salary slip generation for any employee with a real
    // company assigned - i.e. almost always. ownerId scoping (via
    // ownershipClauses above) is the correct - and sufficient - boundary.

    const month = payload.payMonth || payload.month || ''
    const year = payload.payYear || payload.year || new Date().getFullYear()

    ownerId = ownerId || employee.ownerId || null

    // One slip per employee per payroll month (see the unique index on
    // SalarySlip.js for the race-condition-safe version of this same
    // rule) - case-insensitive since "July" vs "july" must count as the
    // same month for this check even though the exact string is what
    // actually gets stored/displayed.
    const existingSlip = await SalarySlip.findOne({
      employee: employee._id,
      year,
      ownerId,
      month: { $regex: `^${escapeRegExp(String(month).trim())}$`, $options: 'i' },
    })
    if (existingSlip) {
      return res.status(409).json({
        message: `A salary slip for ${employee.name || 'this employee'} - ${month} ${year} already exists. Edit the existing slip instead of generating another one.`,
        existingSlipId: String(existingSlip._id),
      })
    }

    // Generate a sequential slipNumber scoped to ownerId. No non-atomic
    // fallback here on purpose: a countDocuments()-based fallback is a
    // check-then-use race in its own right (two concurrent requests both
    // hitting it could compute and persist the same number). If the
    // atomic $inc operation genuinely fails, letting that propagate as a
    // request failure (safe to retry) is the correct trade against
    // silently risking a duplicate financial-record identifier.
    const scope = `salary-slip:${ownerId}`
    const counter = await InvoiceCounter.findOneAndUpdate(
      { scope },
      { $inc: { counter: 1 }, $setOnInsert: { ownerId } },
      { new: true, upsert: true }
    )
    const slipNumber = counter.counter

    // If client didn't supply total deduction, compute from employee's expenses
    const recordedExpenses = (employee.expenses && Array.isArray(employee.expenses.records))
      ? employee.expenses.records.reduce((s, r) => s + Number(r.amount || 0), 0)
      : 0

    // Same numeric/business-rule validation as updateSalarySlip below -
    // previously CREATE trusted these fields from req.body with no
    // Number.isFinite/non-negative check and no status whitelist at all,
    // unlike UPDATE. Applying the same rule here closes that
    // create-vs-update inconsistency (D19.2 financial-operation
    // consistency finding) regardless of caller.
    const baseSalary = Number(payload.baseSalary ?? payload.grossSalary ?? 0)
    const allowances = Number(payload.additionalAllowances ?? 0)
    const deductions = Number(
      (typeof payload.totalDeduction !== 'undefined' && payload.totalDeduction !== null)
        ? payload.totalDeduction
        : recordedExpenses
    )
    const netSalary = payload.netSalary !== undefined && payload.netSalary !== null
      ? Number(payload.netSalary)
      : Math.max(0, baseSalary + allowances - deductions)

    if ([baseSalary, allowances, deductions, netSalary].some((n) => !Number.isFinite(n) || n < 0)) {
      return res.status(400).json({ message: 'Salary figures must be valid, non-negative numbers.' })
    }
    if (deductions > baseSalary + allowances) {
      return res.status(400).json({
        message: 'Deduction amount cannot exceed the remaining available balance.',
      })
    }
    const status = (payload.status && ['draft', 'generated', 'sent'].includes(payload.status))
      ? payload.status
      : 'generated'

    let slip
    try {
      slip = await SalarySlip.create({
        employee: employee._id,
        company: employee.company || null,
        ownerId,
        slipNumber,
        month,
        year,
        baseSalary,
        allowances,
        deductions,
        netSalary,
        status,
        // The exact snapshot the dashboard's own preview/PDF was generated
        // from (employee totals, earnings breakdown, deduction rows, advance
        // summary) - without this, downloads fall back to a reconstruction
        // that can't know per-slip details like days/hours worked.
        slipData: payload.slipData || undefined,
      })
    } catch (createError) {
      // Backstop for the race the pre-check above can't fully close (two
      // requests passing the findOne check at the same instant) - the
      // unique index on SalarySlip.js is what actually throws this.
      if (createError?.code === 11000) {
        return res.status(409).json({
          message: `A salary slip for ${employee.name || 'this employee'} - ${month} ${year} already exists. Edit the existing slip instead of generating another one.`,
        })
      }
      throw createError
    }

    // Single source of truth: the deduction list just used to build this
    // slip is mirrored into Expense History here, server-side, instead of
    // the frontend making separate addExpense calls - Remaining Balance
    // and Payment History are both computed from the same records this
    // writes, so they can never drift from what the slip actually shows.
    if (Array.isArray(payload.deductionEntries)) {
      try {
        await syncSalarySlipExpenseRecords(employee._id, slip._id, payload.deductionEntries)
      } catch (e) {
        console.error('[salary-slip] failed to sync expense history on create', e.message)
      }
    }

    // Running lifetime total (Employee Profile's "Total Earned" KPI and
    // Finance's Money Made "Revenue Generated") - incremented here rather
    // than summed from SalarySlip on every read, so it survives even if
    // old slips are ever purged for storage later.
    await Employee.findByIdAndUpdate(employee._id, { $inc: { totalEarnedAmount: netSalary } });

    await cacheInvalidate(salarySlipCachePrefix(ownerId));
    await cacheInvalidate(`expenses:${ownerId}:`);
    // getFinanceSummary sums SalarySlip.netSalary per employee (Money Made's
    // "Revenue Generated") and by month (period-filtered "Total Expenses"),
    // cached under employeeCachePrefix - keep it in sync with slip writes.
    await cacheInvalidate(employeeCachePrefix(ownerId));

    // Employee-facing notification: "<Month> salary slip is generated" -
    // only when generated by the office from the dashboard (not the rare
    // employee-token path), matching "generated by user using dashboard".
    if (req.user && req.user.role !== 'employee') {
      const monthLabel = String(month || '').trim();
      const notifTitle = monthLabel ? `${monthLabel} salary slip is generated` : 'Salary slip is generated';
      const notifBody = 'Your salary slip is ready to view in the Payment section.';
      const notifPayload = { type: 'salary_slip', slipId: String(slip._id), month, year };

      try {
        await sendPushToEmployee(employee, { title: notifTitle, body: notifBody, data: notifPayload });
      } catch (err) {
        console.error('[salary-slip] push notification failed', err.message);
      }
      try {
        await Notification.create({
          user: employee._id,
          title: notifTitle,
          body: notifBody,
          payload: notifPayload,
          ownerId,
        });
      } catch (err) {
        console.error('[salary-slip] failed to persist employee notification', err.message);
      }
    }

    return res.status(201).json({ salarySlip: slip })
  } catch (error) {
    console.error('createSalarySlip error', error)
    return serverError(res, 'Failed to create salary slip')
  }
}

// Accepts month as either a "YYYY-MM" value (from the dashboard's shared
// MonthFilterSelect - see MonthFilterSelect.jsx) or year/month passed
// separately, and returns a Mongo filter fragment. Slips store `month` as
// a display name ("July") and `year` as a number, so this resolves the
// numeric month back to that display name via a case-insensitive regex
// rather than requiring an exact-string match.
const buildMonthFilter = (monthQuery) => {
  if (!monthQuery) return {}
  const match = String(monthQuery).match(/^(\d{4})-(\d{2})$/)
  if (!match) return {}
  const [, yearStr, monthStr] = match
  const monthIndex = Number(monthStr) - 1
  if (monthIndex < 0 || monthIndex > 11) return {}
  const monthName = new Date(Number(yearStr), monthIndex, 1).toLocaleDateString('en-US', { month: 'long' })
  return {
    year: Number(yearStr),
    month: { $regex: `^${monthName}$`, $options: 'i' },
  }
}

export const listSalarySlips = async (req, res) => {
  try {
    const monthFilter = buildMonthFilter(req.query.month)

    // Employee (mobile app) view - only their own finalized slips, never drafts.
    if (req.employee && req.employee._id) {
      const ownerId = req.employee.ownerId || null
      const slips = await SalarySlip.find({
        employee: req.employee._id,
        ownerId,
        status: { $in: ['generated', 'sent'] },
        ...monthFilter,
      }).sort({ year: -1, createdAt: -1 })
      return res.json({ salarySlips: slips })
    }

    // For other roles, allow filtering by employeeId query param
    // For owner/admin users return all slips
    const employeeId = req.query.employeeId

    let ownerId =
      req.user?.ownerId ||
      req.user?.userId ||
      null

    if (!ownerId) {
      return res.status(401).json({ message: 'User not authenticated' })
    }

    if (!employeeId) {
      // Real server-side pagination - opt-in via page/limit, so callers
      // that need the TRUE full set (useAllSalarySlips.js's next-slip-
      // number max+1 computation and duplicate-check in
      // GenerateSalarySlip.jsx - silently truncating that would compute a
      // wrong/colliding slip number, a correctness bug worse than the
      // slowness this fixes) keep getting the original unbounded query
      // untouched. Only SalarySlip.jsx's list view passes page/limit now,
      // and previously fetched EVERY slip the owner has ever generated
      // (populate('employee') on all of them) just to display 10 rows -
      // at this tenant's scale (3000+ slips) a multi-second, several-MB
      // response for one page.
      const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
      if (!hasPagination) {
        // Excludes slipData - a full PDF-snapshot per row (up to ~1.4MB on
        // one row alone) that neither of this branch's real consumers
        // (Home dashboard's "pending this month" alert check, which only
        // reads status/employee; GenerateSalarySlip.jsx now uses the
        // dedicated generate-info endpoint instead) ever reads. Row-level
        // Preview/Download (SalarySlipRow.jsx) already fetches it on-demand
        // via GET /api/salary-slips/:id when actually needed.
        const cacheKey = `${salarySlipCachePrefix(ownerId)}list:all:${JSON.stringify(monthFilter)}`;
        const slips = await cacheGetOrSet(cacheKey, 20, async () =>
          SalarySlip.find({ ownerId, ...monthFilter }).select('-slipData').populate('employee').sort({ createdAt: -1 }).lean()
        );
        return res.json({ salarySlips: slips });
      }

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const skip = (page - 1) * limit;
      const search = String(req.query.search || '').trim();

      const filter = { ownerId, ...monthFilter };

      // Server-side search across the two fields users actually search by
      // (employee name/trade - not stored on SalarySlip itself, so
      // resolved via a small, ownerId-scoped Employee id lookup first)
      // plus the slip's own displayed invoice number (SLIP-<last 6 hex of
      // _id> - see salarySlipDerivation.js's invoiceNo fallback), matched
      // via $expr against the stringified _id. Both sides of the $or stay
      // scoped to this owner - the Employee lookup is ownerId-filtered
      // before it ever reaches the SalarySlip query.
      if (search) {
        const pattern = escapeRegExp(search);
        const matchingEmployeeIds = await Employee.find({
          ownerId,
          $or: [{ name: { $regex: pattern, $options: 'i' } }, { trade: { $regex: pattern, $options: 'i' } }],
        }).select('_id').lean();

        filter.$or = [
          { employee: { $in: matchingEmployeeIds.map((e) => e._id) } },
          { $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: pattern, options: 'i' } } },
        ];
      }

      const cacheKey = `${salarySlipCachePrefix(ownerId)}list:all:${JSON.stringify(monthFilter)}:${page}:${limit}:${search}`;
      const result = await cacheGetOrSet(cacheKey, 20, async () => {
        const [slips, total] = await Promise.all([
          SalarySlip.find(filter)
            // Excludes slipData - the list view (SalarySlipTable's rows)
            // never reads it; it's only needed for row-level Preview/
            // Download, which SalarySlipRow.jsx now fetches on-demand via
            // GET /api/salary-slips/:id (cached 20s) instead of it riding
            // along on every list page. Measured: this alone was the
            // reason a 10-row page shipped ~1.45MB.
            .select('-slipData')
            // Only the fields normalizeSlipRows actually reads off the
            // populated employee doc (used as a fallback for slips
            // generated before the slipData snapshot existed - see that
            // function's own comment) - not the full document (photo,
            // documents, lifecycle fields, etc.) for every row on every
            // page.
            .populate('employee', 'name firstName lastName trade position ratePerHour rate employeeId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          SalarySlip.countDocuments(filter),
        ]);
        return { slips, total };
      });

      return res.json({
        salarySlips: result.slips,
        total: result.total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(result.total / limit)),
      })
    }
    const employee = await Employee.findOne({ _id: employeeId, ownerId })
    if (!employee) return res.status(404).json({ message: 'Employee not found' })

    // (Same conflation bug as createSalarySlip above - removed. ownerId
    // scoping below is the correct boundary.)

    ownerId = ownerId || employee.ownerId || null
    if (ownerId && String(ownerId) !== String(employee.ownerId || '')) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    const slips = await cacheGetOrSet(
      `${salarySlipCachePrefix(ownerId)}list:emp:${employeeId}:${JSON.stringify(monthFilter)}`,
      20,
      async () => SalarySlip.find({ employee: employeeId, ownerId, ...monthFilter }).sort({ createdAt: -1 }).lean()
    )
    return res.json({ salarySlips: slips })
  } catch (error) {
    return serverError(res, 'Failed to list salary slips')
  }
}

// GET /api/salary-slips/generate-info?employeeId=&month=&year= - backs
// GenerateSalarySlip.jsx's "next slip number" display and its pre-submit
// duplicate check. Previously both read useAllSalarySlips(), which fetched
// this owner's ENTIRE salary-slip history (populate('employee') on every
// row) just to compute Math.max(...slipNumbers) and scan for a matching
// employee+month+year in JS - measured at ~2.5s browser-observed for a
// tenant with a large slip history. Both `slipNumber` and the
// {employee,month,year,ownerId} compound are already indexed (see
// SalarySlip.js), so both answers are single index-backed lookups here -
// no behavior change, same correctness (the unique index is still the
// real duplicate guarantee; this is unchanged from before), just without
// pulling every slip's full document set of the same tenant over the wire.
export const getSalarySlipGenerateInfo = async (req, res) => {
  try {
    const ownerId = req.user?.ownerId || req.user?.userId;
    if (!ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const { employeeId, month, year } = req.query;

    const [latest, duplicate] = await Promise.all([
      SalarySlip.findOne({ ownerId }).sort({ slipNumber: -1 }).select('slipNumber').lean(),
      employeeId && month && year
        ? SalarySlip.findOne({
            ownerId,
            employee: employeeId,
            // Case-insensitive, matching the same comparison the old
            // client-side check used (and buildMonthFilter elsewhere in
            // this file) - the stored `month` casing isn't guaranteed
            // consistent across every slip-creation path.
            month: { $regex: `^${escapeRegExp(String(month).trim())}$`, $options: 'i' },
            year: Number(year),
          })
            .select('_id')
            .lean()
        : Promise.resolve(null),
    ]);

    return res.json({
      nextSlipNumber: (latest?.slipNumber || 0) + 1,
      duplicateExists: Boolean(duplicate),
      existingSlipId: duplicate?._id || null,
    });
  } catch (error) {
    return serverError(res, 'Failed to load salary slip generation info');
  }
};

export const getSalarySlip = async (req, res) => {
  try {
    const id = req.params.id
    const ownerId = req.employee?.ownerId || req.user?.ownerId || null
    const slip = await cacheGetOrSet(
      `${salarySlipCachePrefix(ownerId)}one:${id}`,
      20,
      async () => SalarySlip.findOne({ _id: id, ownerId }).populate('employee').lean()
    )
    if (!slip) return res.status(404).json({ message: 'Salary slip not found' })

    // If requester is an employee, ensure they own it and it isn't a draft.
    if (req.employee && req.employee._id) {
      if (String(slip.employee._id) !== String(req.employee._id)) {
        return res.status(403).json({ message: 'Forbidden' })
      }
      if (slip.status === 'draft') {
        return res.status(404).json({ message: 'Salary slip not found' })
      }
    }
    // (Same conflation bug removed here too - see createSalarySlip note.)

    return res.json({ salarySlip: slip })
  } catch (error) {
    return serverError(res, 'Failed to fetch salary slip')
  }
}

// PUT /api/salary-slips/:id - update an existing slip's figures instead of
// generating a duplicate one for the same month. Deliberately does NOT
// allow changing employee/month/year (that's what generating a new slip is
// for, and it keeps the unique employee+month+year+owner index meaningful).
export const updateSalarySlip = async (req, res) => {
  try {
    const id = req.params.id
    const ownerId = req.user?.ownerId || req.user?.userId || null
    if (!ownerId) return res.status(400).json({ message: 'ownerId is required' })
    if (req.employee) return res.status(403).json({ message: 'Forbidden' })

    const slip = await SalarySlip.findOne({ _id: id, ownerId })
    if (!slip) return res.status(404).json({ message: 'Salary slip not found' })

    const payload = req.body || {}
    const before = {
      baseSalary: slip.baseSalary,
      allowances: slip.allowances,
      deductions: slip.deductions,
      netSalary: slip.netSalary,
      status: slip.status,
    }

    const baseSalary = payload.baseSalary !== undefined || payload.grossSalary !== undefined
      ? Number(payload.baseSalary ?? payload.grossSalary)
      : Number(slip.baseSalary || 0)
    const allowances = payload.additionalAllowances !== undefined || payload.allowances !== undefined
      ? Number(payload.additionalAllowances ?? payload.allowances)
      : Number(slip.allowances || 0)
    const deductions = payload.totalDeduction !== undefined || payload.deductions !== undefined
      ? Number(payload.totalDeduction ?? payload.deductions)
      : Number(slip.deductions || 0)

    if ([baseSalary, allowances, deductions].some((n) => !Number.isFinite(n) || n < 0)) {
      return res.status(400).json({ message: 'Salary figures must be valid, non-negative numbers.' })
    }

    // Same rule as expenses/advances: deductions can never exceed what the
    // employee is actually owed this month - net salary must never go
    // negative. Recomputed server-side (not trusted from the client) so
    // totals stay accurate no matter what was edited.
    const availableBalance = baseSalary + allowances
    if (deductions > availableBalance) {
      return res.status(400).json({
        message: 'Deduction amount cannot exceed the remaining available balance.',
      })
    }

    slip.baseSalary = baseSalary
    slip.allowances = allowances
    slip.deductions = deductions
    slip.netSalary = availableBalance - deductions
    if (Array.isArray(payload.deductionsDetails)) slip.deductionsDetails = payload.deductionsDetails
    if (payload.slipData !== undefined) slip.slipData = payload.slipData
    if (payload.status && ['draft', 'generated', 'sent'].includes(payload.status)) slip.status = payload.status

    await slip.save()

    // Adjust the running lifetime total by the delta, not a full
    // recompute - see createSalarySlip's own comment on why this is
    // incremental rather than live-aggregated.
    const netSalaryDelta = slip.netSalary - before.netSalary
    if (netSalaryDelta !== 0) {
      await Employee.findByIdAndUpdate(slip.employee, { $inc: { totalEarnedAmount: netSalaryDelta } })
    }

    // Same reconciliation as create - only touches Expense History when
    // the caller actually sent a deduction list (editing just the salary
    // figures shouldn't wipe out history that wasn't part of this edit).
    if (Array.isArray(payload.deductionEntries)) {
      try {
        await syncSalarySlipExpenseRecords(slip.employee, slip._id, payload.deductionEntries)
      } catch (e) {
        console.error('[salary-slip] failed to sync expense history on update', e.message)
      }
    }

    await cacheInvalidate(salarySlipCachePrefix(ownerId));
    await cacheInvalidate(`expenses:${ownerId}:`);
    // getFinanceSummary sums SalarySlip.netSalary per employee (Money Made's
    // "Revenue Generated") and by month (period-filtered "Total Expenses"),
    // cached under employeeCachePrefix - keep it in sync with slip writes.
    await cacheInvalidate(employeeCachePrefix(ownerId));

    await createAuditLog({
      user: req.user?.userId || null,
      action: 'salary_slip.update',
      entity: 'SalarySlip',
      entityId: String(slip._id),
      changes: {
        before,
        after: {
          baseSalary: slip.baseSalary,
          allowances: slip.allowances,
          deductions: slip.deductions,
          netSalary: slip.netSalary,
          status: slip.status,
        },
      },
      ownerId,
    })

    return res.json({ salarySlip: slip })
  } catch (error) {
    return serverError(res, 'Failed to update salary slip')
  }
}

export const addDeduction = async (req, res) => {
  try {
    // Consistency fix (D19.2): this route is also behind authenticateDual,
    // but - unlike updateSalarySlip - had no explicit employee-token
    // rejection. In practice an employee-token call falls through to
    // ownerId === null here (req.user is only populated for owner/admin
    // tokens), which happens to make the ownership `$or` below unmatchable
    // against real data (every slip has a real ownerId) - but that's an
    // accident of current data shape, not an explicit authorization
    // boundary, and the ownership-match check further down is skipped
    // entirely whenever requesterIds ends up empty. Reject explicitly, the
    // same as updateSalarySlip and (now) createSalarySlip above.
    if (req.employee) return res.status(403).json({ message: 'Forbidden' });

    const id = req.params.id || req.body?.salarySlipId || req.body?.slipId;
    const ownerId = req.user?.ownerId || req.user?.userId || null;
    const { type, amount, note } = req.body;
    if (!['advance', 'fine', 'other'].includes(type)) return res.status(400).json({ message: 'Invalid deduction type' });

    const slip = await SalarySlip.findOne({
      _id: id,
      $or: [
        { ownerId },
        { company: req.user?.companyId || null },
        { ownerId: null },
      ],
    }).populate('employee');
    if (!slip) return res.status(404).json({ message: 'Salary slip not found' });

    // (Same conflation bug removed here too - see createSalarySlip note.
    // ownerId-based matching in the $or above already covers this.)
    const requesterIds = new Set();
    if (ownerId) requesterIds.add(String(ownerId));
    if (req.user?.userId) requesterIds.add(String(req.user.userId));

    const slipOwnerIds = new Set();
    if (slip.ownerId) slipOwnerIds.add(String(slip.ownerId));
    if (slip.employee?.ownerId) slipOwnerIds.add(String(slip.employee.ownerId));
    if (slip.employee?.owner) slipOwnerIds.add(String(slip.employee.owner));

    if (slipOwnerIds.size > 0 && requesterIds.size > 0) {
      const match = Array.from(slipOwnerIds).some((s) => requesterIds.has(s));
      if (!match) {
        return res.status(404).json({ message: 'Salary slip not found' });
      }
    }

    slip.deductionsDetails = slip.deductionsDetails || [];
    const totalDeductions = slip.deductionsDetails.reduce((s, d) => s + (d.amount || 0), 0) + Number(amount || 0);
    const base = Number(slip.baseSalary || 0);
    const allowances = Number(slip.allowances || 0);

    // Deductions can never exceed what the employee is actually owed this
    // month - net salary must never go negative.
    if (totalDeductions > base + allowances) {
      return res.status(400).json({
        message: 'Deduction amount cannot exceed the remaining available balance.',
      });
    }

    const beforeNetSalary = slip.netSalary;
    slip.deductionsDetails.push({ type, amount: Number(amount || 0), note: note || '' });
    slip.deductions = totalDeductions;
    slip.netSalary = base + allowances - totalDeductions;

    await slip.save();

    // Adjust the running lifetime total by the delta - see
    // createSalarySlip's comment on why this is incremental.
    const netSalaryDelta = slip.netSalary - beforeNetSalary;
    if (netSalaryDelta !== 0 && slip.employee?._id) {
      await Employee.findByIdAndUpdate(slip.employee._id, { $inc: { totalEarnedAmount: netSalaryDelta } });
    }

    // Full reconciliation, not just a push for 'advance' type - Fine/Other
    // deductions previously never made it into Expense History at all,
    // which is exactly the kind of drift requirement #10 is about. Passing
    // the slip's own (now-updated) deductionsDetails as the source of
    // truth means this can never duplicate a prior entry, however many
    // times a deduction is added to this same slip.
    if (slip.employee?._id) {
      try {
        // This endpoint's own type vocabulary ('advance'/'fine'/'other')
        // isn't the same as the deduction-typed strings the balance
        // classification expects (see expenseClassification.js) - 'advance'
        // and 'other' alone are ADDITION types there (an advance given TO
        // the employee, a plain expense), so passed through unmapped they'd
        // be misclassified as increasing the balance instead of reducing
        // it. Map to the equivalent "* deduction" form first.
        const ADD_DEDUCTION_TYPE_MAP = { advance: 'advance deduction', fine: 'fine', other: 'other deduction' };
        const mappedEntries = slip.deductionsDetails.map((d) => ({
          ...(d.toObject ? d.toObject() : d),
          type: ADD_DEDUCTION_TYPE_MAP[String(d.type || '').toLowerCase()] || d.type,
        }));
        await syncSalarySlipExpenseRecords(slip.employee._id, slip._id, mappedEntries);
      } catch (e) {
        console.error('Failed to sync expense history for deduction', e.message);
      }
    }

    await cacheInvalidate(salarySlipCachePrefix(ownerId));
    await cacheInvalidate(`expenses:${ownerId}:`);
    // getFinanceSummary sums SalarySlip.netSalary per employee (Money Made's
    // "Revenue Generated") and by month (period-filtered "Total Expenses"),
    // cached under employeeCachePrefix - keep it in sync with slip writes.
    await cacheInvalidate(employeeCachePrefix(ownerId));

    return res.json({ salarySlip: slip });
  } catch (error) {
    return serverError(res, 'Failed to add deduction');
  }
}

// GET /api/salary-slips/advances - mobile-only: every 'advance' type deduction
// pulled from this employee's own slips, newest first.
export const getMyAdvances = async (req, res) => {
  try {
    if (!req.employee || !req.employee._id) {
      return res.status(401).json({ message: 'Employee authentication required' });
    }
    const ownerId = req.employee.ownerId || null;
    const slips = await SalarySlip.find({
      employee: req.employee._id,
      ownerId,
      status: { $in: ['generated', 'sent'] },
    }).sort({ year: -1, createdAt: -1 });

    const advances = [];
    let totalAdvances = 0;
    for (const slip of slips) {
      for (const d of (slip.deductionsDetails || [])) {
        if (d.type === 'advance') {
          totalAdvances += Number(d.amount || 0);
          advances.push({
            slipId: slip._id,
            month: slip.month,
            year: slip.year,
            amount: d.amount,
            note: d.note || '',
            createdAt: d.createdAt,
          });
        }
      }
    }

    return res.json({ data: { totalAdvances, advances } });
  } catch (error) {
    return serverError(res, 'Failed to fetch advances');
  }
};

// GET /api/salary-slips/:id/download - generates (or regenerates) the PDF
// on the fly from whatever slip data is available and streams it back.
// Reuses the existing generateSalarySlipPdfBuffer service, which was
// previously written but never wired to a route.
export const downloadSalarySlip = async (req, res) => {
  try {
    const id = req.params.id
    const ownerId = req.employee?.ownerId || req.user?.ownerId || null
    const slip = await SalarySlip.findOne({ _id: id, ownerId }).populate('employee company')
    if (!slip) return res.status(404).json({ message: 'Salary slip not found' })

    if (req.employee && req.employee._id) {
      if (String(slip.employee._id) !== String(req.employee._id)) {
        return res.status(403).json({ message: 'Forbidden' })
      }
      if (slip.status === 'draft') {
        return res.status(404).json({ message: 'Salary slip not found' })
      }
    }
    // (Same conflation bug removed here too - see createSalarySlip note.
    // An owner downloading from the dashboard is already correctly scoped
    // by ownerId in the query above.)

    // Prefer the snapshot captured at generation time; fall back to a
    // best-effort reconstruction from the slip's own summary fields so an
    // older slip (created before slipData snapshotting existed) still
    // downloads instead of erroring out.
    const slipData = slip.slipData || {
      payMonth: slip.month,
      payYear: slip.year,
      companyId: slip.company?._id || slip.company,
      company: slip.company,
      companyName: slip.company?.companyLegalName || slip.company?.name || '',
      companyPhone: slip.company?.telephoneNumber || slip.company?.mobileNumber || '',
      companyLogo: slip.company?.logo || null,
      employee: {
        name: slip.employee?.name,
        emiratesId: slip.employee?.emiratesId,
        trade: slip.employee?.trade,
      },
      earnings: {
        calculatedSalary: slip.baseSalary || 0,
        additionalAllowances: slip.allowances || 0,
        grossSalary: Number(slip.baseSalary || 0) + Number(slip.allowances || 0),
      },
      deductionRows: (slip.deductionsDetails || []).map((d) => ({ label: d.note || d.type, value: d.amount })),
      totalDeduction: slip.deductions || 0,
      advance: { totalGiven: 0, thisMonthDeduction: 0, thisMonthGiven: 0, remaining: 0 },
      netSalary: slip.netSalary || 0,
    }

    // Cache the rendered PDF in object storage instead of re-running
    // pdf-lib/jsPDF on every download - this endpoint was previously
    // wired but never cached (see the function comment above), so every
    // request regenerated the file from scratch even when nothing about
    // the slip had changed since the last download. Keyed by the slip's
    // own updatedAt (Mongoose `timestamps: true`) - any edit
    // (updateSalarySlip/addDeduction) bumps updatedAt, which changes the
    // key, so a stale cached PDF is never served after a real edit; it
    // just becomes an orphaned object under its old key (not cleaned up
    // automatically, a small, bounded storage cost - acceptable versus
    // the risk of a manual invalidation call site being missed on some
    // future edit path).
    const cacheFilename = `${slip._id}-${new Date(slip.updatedAt).getTime()}.pdf`;
    const cacheKey = buildTenantKey({ ownerId, folder: 'salary-slip-pdfs', filename: cacheFilename });
    let pdfBuffer;
    let cacheHit = false;
    if (await objectExists({ key: cacheKey })) {
      pdfBuffer = await getObjectBuffer({ key: cacheKey });
      cacheHit = true;
    } else {
      pdfBuffer = await generateSalarySlipPdfBuffer(slipData, ownerId)
      // Best-effort - a failed cache write must never fail the download
      // the user is actively waiting on; the next request just
      // regenerates and tries to cache again.
      saveBuffer({ ownerId, folder: 'salary-slip-pdfs', filename: cacheFilename, buffer: pdfBuffer, mimetype: 'application/pdf' })
        .catch((err) => console.error('Failed to cache salary slip PDF:', err.message));
    }

    res.setHeader('Content-Type', 'application/pdf')
    const filename = `salary-slip-${slip.month}-${slip.year}.pdf`.replace(/["\r\n]/g, '_')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    // Private (tenant-owned document, not public) but real HTTP caching is
    // still safe: the cache key itself already changes on every edit, so
    // an ETag tied to that same key can be trusted for a long time - a
    // conditional re-request for the same slip version is a real 304,
    // not just app-level caching.
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.setHeader('ETag', `"${slip._id}-${new Date(slip.updatedAt).getTime()}"`)
    res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS')

    try {
      await createAuditLog({
        user: req.user?.userId || null,
        action: 'DOWNLOAD_SALARY_SLIP',
        entity: 'SalarySlip',
        entityId: slip._id,
        ownerId: ownerId || slip.ownerId,
        company: slip.company?._id || slip.company || null,
      })
    } catch (e) {
      console.error('Failed to write audit log for salary slip download', e.message)
    }

    return res.send(pdfBuffer)
  } catch (error) {
    return serverError(res, 'Failed to download salary slip')
  }
}

export default { createSalarySlip, listSalarySlips, getSalarySlip, updateSalarySlip, addDeduction, getMyAdvances, downloadSalarySlip }