export const ensureAdmin = (req, res, next) => {
  try {
    const role = (req.user && req.user.role) || '';
    const normalized = String(role || '').toUpperCase();
    if (normalized === 'OWNER' || normalized === 'ADMIN') return next();
    return res.status(403).json({ message: 'Admin access required' });
  } catch (err) {
    return res.status(500).json({ message: 'Authorization error' });
  }
};

export default ensureAdmin;
