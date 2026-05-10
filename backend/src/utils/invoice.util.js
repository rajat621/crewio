export const generateInvoiceNumber = (companyId, counter) => {
  return `INV-${companyId.slice(-4)}-${String(counter).padStart(5, '0')}`;
};

export default { generateInvoiceNumber };
