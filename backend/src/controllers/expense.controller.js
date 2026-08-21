// import Employee from '../models/Employee.js'

// export const getExpenses = async (req, res) => {
//   try {
//     let employeeId = null
//     if (req.user && req.user.role === 'employee') {
//       employeeId = req.user.employeeId
//     } else if (req.query.employeeId) {
//       employeeId = req.query.employeeId
//     }

// const ownerId = req.user?.ownerId || req.user?.userId || null;

// if (!employeeId) {
//   const employees = await Employee.find({ ownerId });

//   const allExpenses = [];

//   employees.forEach((emp) => {
//     (emp.expenses?.records || []).forEach((expense) => {
//       allExpenses.push({
//         employeeId: emp._id,
//         employeeName: emp.fullName || emp.name,
//         ...expense.toObject?.() || expense,
//       });
//     });
//   });

//   return res.json({
//     expenses: {
//       records: allExpenses,
//     },
//   });
// }

//     const employee = await Employee.findOne({ _id: employeeId, ownerId })
//     if (!employee) return res.status(404).json({ message: 'Employee not found' })

//     // Company scoping for non-employee users
//     if (req.user && req.user.role !== 'employee' && req.user.companyId) {
//       const empCompany = String(employee.company || '')
//       if (empCompany && String(req.user.companyId) !== empCompany) {
//         return res.status(403).json({ message: 'Forbidden' })
//       }
//     }

//     return res.json({ expenses: employee.expenses || { records: [] } })
//   } catch (error) {
//     return res.status(500).json({ message: 'Failed to fetch expenses', error: error.message })
//   }
// }

// export const addExpense = async (req, res) => {
//   try {
//     const payload = req.body || {}
//     let employeeId = null
//     if (req.user && req.user.role === 'employee') {
//       employeeId = req.user.employeeId
//     } else if (payload.employeeId) {
//       employeeId = payload.employeeId
//     }

//     if (!employeeId) return res.status(400).json({ message: 'employeeId required' })

//     const ownerId = req.user?.ownerId || req.user?.userId || null
//     const employee = await Employee.findOne({ _id: employeeId, ownerId })
//     if (!employee) return res.status(404).json({ message: 'Employee not found' })

//     if (req.user && req.user.role !== 'employee' && req.user.companyId) {
//       const empCompany = String(employee.company || '')
//       if (empCompany && String(req.user.companyId) !== empCompany) {
//         return res.status(403).json({ message: 'Forbidden' })
//       }
//     }

//     const record = {
//       _id: new Date().getTime().toString(),
//       type: payload.type || 'other',
//       amount: Number(payload.amount || 0),
//       date: payload.date || new Date().toISOString(),
//       note: payload.note || '',
//     }

//     const updated = await Employee.findOneAndUpdate(
//       { _id: employeeId, ownerId },
//       { $push: { 'expenses.records': record } },
//       { new: true }
//     )

//     return res.status(201).json({ expense: record, expenses: updated.expenses })
//   } catch (error) {
//     return res.status(500).json({ message: 'Failed to add expense', error: error.message })
//   }
// }

// export default { getExpenses, addExpense }


import mongoose from 'mongoose'
import Employee from '../models/Employee.js'
import { serverError } from '../utils/apiResponse.js'
import { isDeductionType, computeRemainingBalance } from '../utils/expenseClassification.js'
import { cacheGetOrSet, cacheInvalidate } from '../utils/cache.util.js'
import { employeeCachePrefix } from './employee.controller.js'

const expenseCachePrefix = (ownerId) => `expenses:${ownerId}:`;
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getExpenses = async (req, res) => {
  try {
    let employeeId = null
    if (req.user && req.user.role === 'employee') {
      employeeId = req.user.employeeId
    } else if (req.query.employeeId) {
      employeeId = req.query.employeeId
    }

    const ownerId = req.user?.ownerId || req.user?.userId || null;

    if (!employeeId) {
      // Real pagination, employee-grain (opt-in via page/limit - same
      // non-breaking pattern as salarySlip.controller.js's listSalarySlips).
      // The grain matches ExpensesTable's actual UI (one row per employee
      // with expense history, most-recently-active first) rather than
      // per-record, so an employee's own history is never split across
      // pages. Previously this fetched EVERY employee's full `expenses`
      // blob into Node and flattened it there - unbounded, grows without
      // limit as advances/deductions accumulate (measured 1.45MB/6,509
      // records at this tenant's current size). The aggregation below does
      // the same sort/filter/page work in Mongo, only ever pulling the
      // requested page's employees over the wire.
      const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;

      if (!hasPagination) {
        const cacheKey = `${expenseCachePrefix(ownerId)}all`;
        const allExpenses = await cacheGetOrSet(cacheKey, 20, async () => {
          const employees = await Employee.find({ ownerId }).select('name fullName expenses').lean();
          const out = [];
          employees.forEach((emp) => {
            (emp.expenses?.records || []).forEach((expense) => {
              out.push({
                employeeId: emp._id,
                employeeName: emp.fullName || emp.name,
                ...expense,
              });
            });
          });
          return out;
        });

        return res.json({
          expenses: {
            records: allExpenses,
          },
        });
      }

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
      const skip = (page - 1) * limit;
      const search = String(req.query.search || '').trim();

      const cacheKey = `${expenseCachePrefix(ownerId)}page:${page}:${limit}:${search}`;
      const result = await cacheGetOrSet(cacheKey, 20, async () => {
        // Aggregate $match does NOT apply Mongoose's automatic schema-based
        // casting the way .find() does - ownerId must be cast to ObjectId
        // by hand or this silently matches zero documents (Employee.ownerId
        // is stored as ObjectId; req.user.ownerId arrives as a string).
        const matchStage = { ownerId: new mongoose.Types.ObjectId(String(ownerId)) };
        if (search) {
          const pattern = escapeRegExp(search);
          matchStage.$or = [
            { name: { $regex: pattern, $options: 'i' } },
            { fullName: { $regex: pattern, $options: 'i' } },
            { trade: { $regex: pattern, $options: 'i' } },
          ];
        }

        // Two-stage on purpose - explain("executionStats") found the real
        // cost here: the ownerId $match itself is a clean IXSCAN (1002
        // keys/docs examined, 16ms, zero waste - not the bottleneck). What
        // WAS expensive is a single-pass pipeline carrying every matched
        // employee's FULL expenses.records array (all 1002 of them, this
        // tenant's entire multi-year advance/deduction history) through
        // $sort/$skip/$limit just to compute one $max timestamp per
        // employee for ordering - Mongo has to load and serialize all
        // 1002 full histories to sort them, even though only `limit`
        // employees' full data is ever actually used in the response.
        // Stage 1 below computes latestTs from a tiny per-employee
        // projection (no `expenses` field carried at all) to find the
        // right page of _ids cheaply; stage 2 fetches full records for
        // only those `limit` _ids.
        const idPipeline = [
          { $match: matchStage },
          { $project: { latestTs: { $max: '$expenses.records.date' } } },
          { $match: { latestTs: { $ne: null } } },
        ];

        // $facet runs both branches (the page of _ids, and the total
        // count) off the same cheap idPipeline scan in a single round
        // trip to Atlas, instead of two separate aggregate calls -
        // measured concurrency testing found the two-call version's extra
        // round trip actually cost more under a concurrent cold-cache
        // burst than the smaller per-call payload saved.
        const [facetResult] = await Employee.aggregate([
          ...idPipeline,
          {
            $facet: {
              page: [{ $sort: { latestTs: -1 } }, { $skip: skip }, { $limit: limit }],
              totalCount: [{ $count: 'total' }],
            },
          },
        ]);
        const pageIds = facetResult?.page || [];
        const totalAgg = facetResult?.totalCount || [];

        // $in does not preserve input order - re-sort in JS against the
        // already-decided pageIds order (cheap: at most `limit` items).
        const orderedIds = pageIds.map((row) => row._id);
        const employeeDocs = await Employee.find({ _id: { $in: orderedIds } })
          .select('name fullName trade position emiratesId employeeId expenses')
          .lean();
        const employeeById = new Map(employeeDocs.map((emp) => [String(emp._id), emp]));

        const records = [];
        orderedIds.forEach((id) => {
          const emp = employeeById.get(String(id));
          if (!emp) return;
          (emp.expenses?.records || []).forEach((expense) => {
            records.push({
              employeeId: emp._id,
              employeeName: emp.fullName || emp.name,
              trade: emp.trade || emp.position || '',
              emiratesId: emp.emiratesId || '',
              employeeCode: emp.employeeId || '',
              ...expense,
            });
          });
        });

        return { records, total: totalAgg[0]?.total || 0 };
      });

      return res.json({
        expenses: { records: result.records },
        total: result.total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(result.total / limit)),
      });
    }

    const cacheKey = `${expenseCachePrefix(ownerId)}one:${employeeId}`;
    const expenses = await cacheGetOrSet(cacheKey, 20, async () => {
      const employee = await Employee.findOne({ _id: employeeId, ownerId }).select('company expenses').lean();
      if (!employee) return undefined;
      return employee.expenses || { records: [] };
    });

    if (expenses === undefined) return res.status(404).json({ message: 'Employee not found' })

    // NOTE: previously there was an additional check here comparing
    // employee.company (the employee's assigned CLIENT company/site)
    // against req.user.companyId (the owner's own auto-created internal
    // invoicing company - see ensureOwnerCompanyForUser). Those are two
    // different documents and can never legitimately match, so that check
    // did nothing but incorrectly 403 valid requests. ownerId scoping above
    // is the correct - and sufficient - tenant boundary.

    return res.json({ expenses })
  } catch (error) {
    return serverError(res, 'Failed to fetch expenses')
  }
}

export const addExpense = async (req, res) => {
  try {
    const payload = req.body || {}
    let employeeId = null
    if (req.user && req.user.role === 'employee') {
      employeeId = req.user.employeeId
    } else if (payload.employeeId) {
      employeeId = payload.employeeId
    }

    if (!employeeId) return res.status(400).json({ message: 'employeeId required' })

    const ownerId = req.user?.ownerId || req.user?.userId || null
    const employee = await Employee.findOne({ _id: employeeId, ownerId })
    if (!employee) return res.status(404).json({ message: 'Employee not found' })

    // See getExpenses above - the old req.user.companyId check here was the
    // same bug: it silently blocked every addExpense call for an employee
    // with a real client company assigned (i.e. almost always), which is
    // exactly what was making salary-slip deductions never actually show
    // up in the Expense ledger. ownerId scoping is the correct boundary.

    const record = {
      _id: new Date().getTime().toString(),
      type: payload.type || 'other',
      amount: Number(payload.amount || 0),
      date: payload.date || new Date().toISOString(),
      note: payload.note || '',
    }

    if (!Number.isFinite(record.amount) || record.amount < 0) {
      return res.status(400).json({ message: 'Amount must be a valid, non-negative number.' })
    }

    // Deductions (fine/penalty/gas deduction/advance deduction/etc - see
    // expenseClassification.js) can never exceed what's actually left in
    // the employee's balance. Additions (advance, gas, food, travel, plain
    // "other" expenses) don't draw down that balance, so they're never
    // blocked here.
    if (isDeductionType(record.type)) {
      const remainingBalance = computeRemainingBalance(employee.expenses?.records || [])
      if (record.amount > remainingBalance) {
        return res.status(400).json({
          message: 'Deduction amount cannot exceed the remaining available balance.',
        })
      }
    }

    const updated = await Employee.findOneAndUpdate(
      { _id: employeeId, ownerId },
      { $push: { 'expenses.records': record } },
      { new: true }
    )

    await cacheInvalidate(expenseCachePrefix(ownerId));
    // getFinanceSummary sums Employee.expenses.records (advance entries) for
    // Money Made's "Total Investment", cached under employeeCachePrefix.
    await cacheInvalidate(employeeCachePrefix(ownerId));

    return res.status(201).json({ expense: record, expenses: updated.expenses })
  } catch (error) {
    return serverError(res, 'Failed to add expense')
  }
}

export default { getExpenses, addExpense }