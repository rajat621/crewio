const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
};

// Use a core set of required fields for completeness. Some optional fields
// (like websiteLink or nationality) are not mandatory for showing the
// "complete" state in the UI.
const CORE_REQUIRED_FIELDS = [
  "name",
  "trn",
  "address",
  "city",
  "contactEmail",
  "mobileNumber",
];

export const isCompanyProfileComplete = (company) => {
  if (!company) return false;
  return CORE_REQUIRED_FIELDS.every((field) => hasValue(company[field]));
};
