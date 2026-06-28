import SalarySlip from '../models/SalarySlip.js'
import Employee from '../models/Employee.js'
import InvoiceCounter from '../models/InvoiceCounter.js'

// Create a salary slip. If request is from an employee token, use that
// employee; otherwise the caller must provide `employeeId` in the body.
export const createSalarySlip = async (req, res) => {
  try {
    const payload = req.body || {}

    let employeeId = null
    if (req.user && req.user.role === 'employee') {
      employeeId = req.user.employeeId
    } else if (payload.employeeId) {
      employeeId = payload.employeeId
    }

    if (!employeeId) return res.status(400).json({ message: 'employeeId is required' })

    let ownerId = req.user?.ownerId || req.user?.userId || null
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

    // If caller is a normal user (non-employee) and has companyId, ensure employee belongs to same company
    if (req.user && req.user.role !== 'employee' && req.user.companyId) {
      const empCompany = String(employee.company || '')
      if (empCompany && String(req.user.companyId) !== empCompany) {
        return res.status(403).json({ message: 'Forbidden' })
      }
    }

    const month = payload.payMonth || payload.month || ''
    const year = payload.payYear || payload.year || new Date().getFullYear()

    ownerId = ownerId || employee.ownerId || null
      // Generate a sequential slipNumber scoped to ownerId
      let slipNumber = null
      try {
        const scope = `salary-slip:${ownerId || 'global'}`
        const counter = await InvoiceCounter.findOneAndUpdate(
          { scope },
          { $inc: { counter: 1 }, $setOnInsert: { ownerId } },
          { new: true, upsert: true }
        )
        slipNumber = counter.counter
      } catch (e) {
        // fallback: compute by counting existing slips (best-effort)
        const count = await SalarySlip.countDocuments({ ownerId })
        slipNumber = count + 1
      }

      // If client didn't supply total deduction, compute from employee's expenses
      const recordedExpenses = (employee.expenses && Array.isArray(employee.expenses.records))
        ? employee.expenses.records.reduce((s, r) => s + Number(r.amount || 0), 0)
        : 0

      const slip = await SalarySlip.create({
      employee: employee._id,
      company: employee.company || null,
      ownerId,
        slipNumber,
      month,
      year,
      baseSalary: payload.baseSalary || payload.grossSalary || 0,
      allowances: payload.additionalAllowances || 0,
        deductions: (typeof payload.totalDeduction !== 'undefined' && payload.totalDeduction !== null) ? payload.totalDeduction : recordedExpenses,
      netSalary: payload.netSalary || 0,
      status: payload.status || 'generated',
    })

    return res.status(201).json({ salarySlip: slip })
  } catch (error) {
    console.error('createSalarySlip error', error)
    return res.status(500).json({ message: 'Failed to create salary slip', error: error.message })
  }
}

export const listSalarySlips = async (req, res) => {
  try {
    // If employee, only return their slips
    if (req.user && req.user.role === 'employee') {
      const employeeId = req.user.employeeId
      const ownerId = req.user.ownerId || null
      const slips = await SalarySlip.find({ employee: employeeId, ownerId }).sort({ createdAt: -1 })
      return res.json({ salarySlips: slips })
    }

    // For other roles, allow filtering by employeeId query param
// For owner/admin users return all slips
const employeeId = req.query.employeeId

let ownerId =
  req.user?.ownerId ||
  req.user?.userId ||
  null

if (!employeeId) {
  const slips = await SalarySlip.find({
    ownerId
  })
    .populate('employee')
    .sort({ createdAt: -1 })

  return res.json({
    salarySlips: slips
  })
}
    const employee = await Employee.findOne({ _id: employeeId, ownerId })
    if (!employee) return res.status(404).json({ message: 'Employee not found' })

    if (req.user && req.user.companyId) {
      const empCompany = String(employee.company || '')
      if (empCompany && String(req.user.companyId) !== empCompany) {
        return res.status(403).json({ message: 'Forbidden' })
      }
    }

    ownerId = ownerId || employee.ownerId || null
    if (ownerId && String(ownerId) !== String(employee.ownerId || '')) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    const slips = await SalarySlip.find({ employee: employeeId, ownerId }).sort({ createdAt: -1 })
    return res.json({ salarySlips: slips })
  } catch (error) {
    return res.status(500).json({ message: 'Failed to list salary slips', error: error.message })
  }
}

export const getSalarySlip = async (req, res) => {
  try {
    const id = req.params.id
    const ownerId = req.user?.ownerId || null
    const slip = await SalarySlip.findOne({ _id: id, ownerId }).populate('employee')
    if (!slip) return res.status(404).json({ message: 'Salary slip not found' })

    // If requester is employee, ensure they own it
    if (req.user && req.user.role === 'employee') {
      if (String(slip.employee._id) !== String(req.user.employeeId)) {
        return res.status(403).json({ message: 'Forbidden' })
      }
      // also ensure tenant matches
      const requesterOwner = req.user.ownerId || req.user.owner || null
      if (slip.ownerId && requesterOwner && String(slip.ownerId) !== String(requesterOwner)) {
        return res.status(403).json({ message: 'Forbidden' })
      }
    } else if (req.user && req.user.companyId) {
      const empCompany = String(slip.employee.company || '')
      if (empCompany && String(req.user.companyId) !== empCompany) {
        return res.status(403).json({ message: 'Forbidden' })
      }
    }

    return res.json({ salarySlip: slip })
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch salary slip', error: error.message })
  }
}

export const addDeduction = async (req, res) => {
  try {
    const id = req.params.id || req.body?.salarySlipId || req.body?.slipId;
    console.log("SLIP ID:", id);
    const ownerId = req.user?.ownerId || req.user?.userId || null;
    const { type, amount, note } = req.body;
    if (!['advance', 'fine', 'other'].includes(type)) return res.status(400).json({ message: 'Invalid deduction type' });

    // Find slip first, then validate owner scoping explicitly to avoid lookup mismatches
    const slip = await SalarySlip.findOne({
      _id: id,
      $or: [
        { ownerId },
        { company: req.user?.companyId || null },
        { ownerId: null },
      ],
    }).populate('employee');
    console.log("SLIP FOUND:", slip);
    if (!slip) return res.status(404).json({ message: 'Salary slip not found' });

    // If caller is an authenticated owner/admin, allow action (after optional company check)
    if (req.user && (req.user.role === 'owner' || req.user.role === 'admin')) {
      // If company scoping is available on requester, ensure slip belongs to same company
      if (req.user.companyId) {
        const slipCompany = String(slip.company || slip.employee?.company || '');
        if (slipCompany && String(req.user.companyId) !== slipCompany) {
          return res.status(404).json({ message: 'Salary slip not found' });
        }
      }
      // owner/admin allowed — continue
    } else {
      // Build sets of possible requester identifiers and slip owner identifiers
      const requesterIds = new Set();
      if (ownerId) requesterIds.add(String(ownerId));
      if (req.user?.userId) requesterIds.add(String(req.user.userId));

      const slipOwnerIds = new Set();
      if (slip.ownerId) slipOwnerIds.add(String(slip.ownerId));
      if (slip.employee?.ownerId) slipOwnerIds.add(String(slip.employee.ownerId));
      if (slip.employee?.owner) slipOwnerIds.add(String(slip.employee.owner));

      // If both sides have identifiable owners and there is no overlap, treat as not found
      if (slipOwnerIds.size > 0 && requesterIds.size > 0) {
        const match = Array.from(slipOwnerIds).some((s) => requesterIds.has(s));
        if (!match) {
          // Debug: log mismatch details to help diagnose owner/id mapping issues
          console.error('addDeduction owner mismatch', {
            requesterIds: Array.from(requesterIds),
            slipOwnerIds: Array.from(slipOwnerIds),
            slipOwner: slip.ownerId,
            slipEmployeeOwnerId: slip.employee?.ownerId,
            slipEmployeeOwner: slip.employee?.owner,
            requesterUser: req.user ? { userId: req.user.userId, ownerId: req.user.ownerId, companyId: req.user.companyId, role: req.user.role } : null,
          });
          return res.status(404).json({ message: 'Salary slip not found' });
        }
      }
    }

    slip.deductionsDetails = slip.deductionsDetails || [];
    slip.deductionsDetails.push({ type, amount: Number(amount || 0), note: note || '' });

    // Recalculate totals
    const totalDeductions = slip.deductionsDetails.reduce((s, d) => s + (d.amount || 0), 0);
    slip.deductions = totalDeductions;
    const base = Number(slip.baseSalary || 0);
    const allowances = Number(slip.allowances || 0);
    slip.netSalary = base + allowances - totalDeductions;

    await slip.save();
    return res.json({ salarySlip: slip });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to add deduction', error: error.message });
  }
}

export default { createSalarySlip, listSalarySlips, getSalarySlip, addDeduction }
