export const getCompanyId = (user) => {
  if (!user) return null;
  // Normalize several possible shapes
  if (user.companyId) return user.companyId;
  if (user.company) {
    if (typeof user.company === 'string') return user.company;
    if (user.company._id) return user.company._id;
    if (user.company.id) return user.company.id;
  }
  // legacy fields
  if (user.companyId === null || user.company === null) return null;
  return null;
};

export default getCompanyId;
