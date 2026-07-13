export const getCompanyId = (user) => {
  if (!user) return null;
  // Normalize several possible shapes
  if (user.companyId) {
    // could be an object or string
    if (typeof user.companyId === 'string') return user.companyId;
    if (user.companyId._id) return String(user.companyId._id);
    if (user.companyId.id) return String(user.companyId.id);
  }
  if (user.company) {
    if (typeof user.company === 'string') return user.company;
    if (user.company._id) return String(user.company._id);
    if (user.company.id) return String(user.company.id);
  }
  // legacy fields
  if (user.companyId === null || user.company === null) return null;
  return null;
};

export default getCompanyId;
