const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
};

const REQUIRED_COMPANY_FIELDS = [
  "name",
  "companyLegalName",
  "trn",
  "websiteLink",
  "address",
  "city",
  "nationality",
  "contactEmail",
  "mobileNumber",
];

export const isCompanyProfileComplete = (company) => {
  if (!company) return false;
  return REQUIRED_COMPANY_FIELDS.every((field) => hasValue(company[field]));
};
