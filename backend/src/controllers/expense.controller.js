import Employee from '../models/Employee.js'

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
  const employees = await Employee.find({ ownerId });

  const allExpenses = [];

  employees.forEach((emp) => {
    (emp.expenses?.records || []).forEach((expense) => {
      allExpenses.push({
        employeeId: emp._id,
        employeeName: emp.fullName || emp.name,
        ...expense.toObject?.() || expense,
      });
    });
  });

  return res.json({
    expenses: {
      records: allExpenses,
    },
  });
}

    const employee = await Employee.findOne({ _id: employeeId, ownerId })
    if (!employee) return res.status(404).json({ message: 'Employee not found' })

    // Company scoping for non-employee users
    if (req.user && req.user.role !== 'employee' && req.user.companyId) {
      const empCompany = String(employee.company || '')
      if (empCompany && String(req.user.companyId) !== empCompany) {
        return res.status(403).json({ message: 'Forbidden' })
      }
    }

    return res.json({ expenses: employee.expenses || { records: [] } })
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch expenses', error: error.message })
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

    if (req.user && req.user.role !== 'employee' && req.user.companyId) {
      const empCompany = String(employee.company || '')
      if (empCompany && String(req.user.companyId) !== empCompany) {
        return res.status(403).json({ message: 'Forbidden' })
      }
    }

    const record = {
      _id: new Date().getTime().toString(),
      type: payload.type || 'other',
      amount: Number(payload.amount || 0),
      date: payload.date || new Date().toISOString(),
      note: payload.note || '',
    }

    const updated = await Employee.findOneAndUpdate(
      { _id: employeeId, ownerId },
      { $push: { 'expenses.records': record } },
      { new: true }
    )

    return res.status(201).json({ expense: record, expenses: updated.expenses })
  } catch (error) {
    return res.status(500).json({ message: 'Failed to add expense', error: error.message })
  }
}

export default { getExpenses, addExpense }
