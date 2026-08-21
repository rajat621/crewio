import CompanyExpense from '../models/CompanyExpense.js';
import { serverError } from '../utils/apiResponse.js';
import { cacheGetOrSet, cacheInvalidate } from '../utils/cache.util.js';
import { employeeCachePrefix } from './employee.controller.js';

const companyExpenseCachePrefix = (ownerId) => `companyExpenses:${ownerId}:`;

// Finance's getFinanceSummary (dashboard.controller.js) aggregates
// CompanyExpense directly but caches its result under the `employees:`
// prefix (reused via employeeCachePrefix, same as getDashboardSummary) - a
// CompanyExpense write only busting its own `companyExpenses:` prefix left
// the Finance page's cached totals/expenses stale for up to the finance-
// summary's own 30s TTL. Invalidate both prefixes on every write.

// Accepts either a "YYYY-MM" month filter or explicit from/to, matching the
// same month-dropdown pattern already used by Salary Slip / Tax Invoices
// (see MonthFilterSelect.jsx) - "" / omitted means show everything.
const buildDateFilter = (month) => {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return {};
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { date: { $gte: start, $lt: end } };
};

export const listCompanyExpenses = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const month = req.query.month || '';
    const cacheKey = `${companyExpenseCachePrefix(user.ownerId)}list:${month}`;

    const expenses = await cacheGetOrSet(cacheKey, 20, async () =>
      CompanyExpense.find({ ownerId: user.ownerId, ...buildDateFilter(month) })
        .sort({ date: -1, createdAt: -1 })
        .lean()
    );

    return res.json({ expenses });
  } catch (error) {
    return serverError(res, 'Failed to fetch company expenses');
  }
};

export const createCompanyExpense = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const { name, date, amount } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Expense name is required' });
    }
    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    const expense = await CompanyExpense.create({
      ownerId: user.ownerId,
      name: String(name).trim(),
      date: new Date(date),
      amount: Number(amount) || 0,
    });

    await Promise.all([
      cacheInvalidate(companyExpenseCachePrefix(user.ownerId)),
      cacheInvalidate(employeeCachePrefix(user.ownerId)),
    ]);

    return res.status(201).json({ expense });
  } catch (error) {
    return serverError(res, 'Failed to add company expense');
  }
};

export const updateCompanyExpense = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const { name, date, amount } = req.body;
    const update = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Expense name is required' });
      update.name = String(name).trim();
    }
    if (date !== undefined) update.date = new Date(date);
    if (amount !== undefined) update.amount = Number(amount) || 0;

    const expense = await CompanyExpense.findOneAndUpdate(
      { _id: req.params.id, ownerId: user.ownerId },
      update,
      { new: true }
    );

    if (!expense) return res.status(404).json({ message: 'Company expense not found' });

    await Promise.all([
      cacheInvalidate(companyExpenseCachePrefix(user.ownerId)),
      cacheInvalidate(employeeCachePrefix(user.ownerId)),
    ]);

    return res.json({ expense });
  } catch (error) {
    return serverError(res, 'Failed to update company expense');
  }
};

export const deleteCompanyExpense = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.ownerId) return res.status(401).json({ message: 'User not authenticated' });

    const expense = await CompanyExpense.findOneAndDelete({ _id: req.params.id, ownerId: user.ownerId });
    if (!expense) return res.status(404).json({ message: 'Company expense not found' });

    await Promise.all([
      cacheInvalidate(companyExpenseCachePrefix(user.ownerId)),
      cacheInvalidate(employeeCachePrefix(user.ownerId)),
    ]);

    return res.json({ message: 'Company expense deleted' });
  } catch (error) {
    return serverError(res, 'Failed to delete company expense');
  }
};

export default { listCompanyExpenses, createCompanyExpense, updateCompanyExpense, deleteCompanyExpense };