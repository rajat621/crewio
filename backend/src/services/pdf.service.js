import PDFDocument from 'pdfkit';
import fs from 'fs';

export const generatePdf = async (data) => {
  const { clientDetails, invoiceDetails, items, vatRate, totalDeductions } = data;

  // Group items by trade and sum values
  const groupedItems = items.reduce((acc, item) => {
    const key = `${item.trade}-${item.id || ''}`;
    if (!acc[key]) {
      acc[key] = { ...item, amount: 0, hours: 0 };
    }
    acc[key].amount += item.amount;
    acc[key].hours += item.hours;
    return acc;
  }, {});

  const groupedItemsArray = Object.values(groupedItems);

  const doc = new PDFDocument({ margin: 50 });
  const pdfPath = `./src/storage/invoices/invoice_${invoiceDetails.invoiceNumber}.pdf`;
  const writeStream = fs.createWriteStream(pdfPath);
  doc.pipe(writeStream);

  // Header
  doc.fontSize(20).text('Tax Invoice', { align: 'center' });
  doc.moveDown();

  // Client Details
  doc.fontSize(12).text(`M/s. ${clientDetails.name}`);
  doc.text(clientDetails.address);
  doc.text(`TRN: ${clientDetails.trn}`);
  doc.moveDown();

  // Invoice Details
  doc.text(`Invoice No: ${invoiceDetails.invoiceNumber}`);
  doc.text(`Date: ${invoiceDetails.date}`);
  doc.text(`Invoice for the month of ${invoiceDetails.month}`);
  doc.moveDown();

  // Table Header
  const tableTop = 200;
  const itemColumns = ['SI NO', 'TRADE', 'PROJECT ID', 'UNIT PRICE', 'HOURS', 'AMOUNT', 'VAT', 'NET AMOUNT'];
  const columnWidths = [50, 100, 100, 80, 60, 80, 60, 100];

  let x = 50;
  itemColumns.forEach((col, i) => {
    doc.text(col, x, tableTop, { width: columnWidths[i], align: 'center' });
    x += columnWidths[i];
  });

  // Table Rows
  let y = tableTop + 20;
  let subtotal = 0;
  groupedItemsArray.forEach((item, index) => {
    x = 50;
    const row = [
      index + 1,
      item.trade || '',
      item.projectId || '',
      item.unitPrice || '',
      item.hours.toFixed(2) || '',
      item.amount.toFixed(2) || '',
      (item.amount * vatRate).toFixed(2) || '',
      (item.amount + item.amount * vatRate).toFixed(2) || ''
    ];

    row.forEach((cell, i) => {
      if (cell !== '') {
        doc.text(cell, x, y, { width: columnWidths[i], align: 'center', ellipsis: true });
      }
      x += columnWidths[i];
    });

    subtotal += item.amount;
    y += 20;
  });

  // Total Section
  const vatAmount = subtotal * vatRate;
  const total = subtotal + vatAmount - totalDeductions;

  doc.text('TOTAL DEDUCTION', 50, y, { width: 400, align: 'right' });
  doc.text(totalDeductions.toFixed(2), 450, y, { width: 100, align: 'right' });
  y += 20;

  doc.text('TOTAL', 50, y, { width: 400, align: 'right' });
  doc.text(subtotal.toFixed(2), 450, y, { width: 100, align: 'right' });
  y += 20;

  doc.text('VAT', 50, y, { width: 400, align: 'right' });
  doc.text(vatAmount.toFixed(2), 450, y, { width: 100, align: 'right' });
  y += 20;

  doc.text('NET AMOUNT', 50, y, { width: 400, align: 'right' });
  doc.text(total.toFixed(2), 450, y, { width: 100, align: 'right' });

  // Footer
  doc.moveDown(2);
  doc.text('Thanks and Regards,');
  doc.text(clientDetails.companyName);
  doc.text(`TRN No: ${clientDetails.trn}`);

  doc.end();

  return { pdfPath };
};

export default { generatePdf };
