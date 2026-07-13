import { jsPDF } from 'jspdf';
import Company from '../models/Company.js';
import { tryResolveLogoBytes } from './salarySlipPdf.service.js';

/**
 * This is a line-for-line port of `generateSalarySlipPdf(data)` in
 * crewcontrol-front/src/pages/salary-slip/GenerateSalarySlip.jsx, which is
 * what the dashboard actually uses to render the slip a user downloads
 * there. jsPDF runs fine in Node (it's isomorphic), so rather than
 * maintaining a second, hand-drawn pdf-lib layout that inevitably drifts
 * from the dashboard's real one (different fonts, spacing, card framing),
 * this produces the byte-for-byte same visual layout server-side - so
 * "download slip" from the mobile app opens the exact same document the
 * dashboard generates, not a lookalike.
 *
 * Keep this in sync with GenerateSalarySlip.jsx's generateSalarySlipPdf -
 * if that layout changes, mirror the change here.
 */

const SLIP_DARK = '#1F2937';
const SLIP_BODY = '#374151';
const SLIP_MUTED = '#6B7280';
const SLIP_DIVIDER = '#E5E7EB';
const SLIP_FOOTER_BG = '#F5F3FF';
const SLIP_AVATAR_BG = '#C7C9D6';
const SLIP_AVATAR_FG = '#5F5E72';

// Browser version fetches a remote URL and converts it to a data URI; here
// we resolve the same possible shapes (data URI already, a FileRecord-
// backed upload, a relative storage path, or a remote URL) using the same
// helper the old pdf-lib service used, then hand jsPDF a data URI string.
const resolveCompanyLogoDataUri = async (slipData) => {
  if (slipData.companyLogo && typeof slipData.companyLogo === 'string' && slipData.companyLogo.startsWith('data:')) {
    return slipData.companyLogo;
  }

  let company = null;
  if (slipData.companyId) {
    try {
      company = await Company.findById(slipData.companyId).lean();
    } catch (e) {
      // ignore - fall through to whatever snapshot fields we have
    }
  }
  const companySnapshot = slipData.company || {};
  const finalCompany = {
    ...(company || {}),
    ...(companySnapshot || {}),
    logo: slipData.companyLogo || company?.logo || companySnapshot?.logo || null,
  };

  const asset = await tryResolveLogoBytes(finalCompany);
  if (!asset) return null;
  return `data:${asset.mime};base64,${asset.bytes.toString('base64')}`;
};

export const generateSalarySlipPdfBuffer = async (rawData) => {
  const data = { ...rawData };
  data.companyLogo = await resolveCompanyLogoDataUri(rawData);

  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const pageWidth = 148;
  const marginX = 12;
  const rightX = pageWidth - marginX;
  let y = 16;

  const drawDivider = (yy) => {
    doc.setDrawColor(SLIP_DIVIDER);
    doc.setLineWidth(0.2);
    doc.line(marginX, yy, rightX, yy);
  };

  const drawRow = (label, value, yy, { bold = false } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(10);
    doc.setTextColor(bold ? SLIP_DARK : SLIP_BODY);
    doc.text(label, marginX, yy);
    doc.text(value, rightX, yy, { align: 'right' });
  };

  const drawSection = (heading, subheading, rows, total) => {
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(SLIP_DARK);
    doc.text(heading, marginX, y);
    if (subheading) {
      const headingWidth = doc.getTextWidth(heading);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.text(subheading, marginX + headingWidth + 1.6, y);
    }
    y += 4;
    drawDivider(y);
    y += 5;
    rows.forEach((row) => {
      drawRow(row.label, row.value, y);
      y += 5.4;
    });
    y += 0.4;
    drawDivider(y);
    y += 5;
    drawRow(total.label, total.value, y, { bold: true });
  };

  // Header: avatar + company info
  if (data.companyLogo && typeof data.companyLogo === 'string' && data.companyLogo.startsWith('data:image')) {
    try {
      const imgX = marginX;
      const imgY = y - 4;
      const format = data.companyLogo.startsWith('data:image/png')
        ? 'PNG'
        : data.companyLogo.startsWith('data:image/jpeg') || data.companyLogo.startsWith('data:image/jpg')
        ? 'JPEG'
        : 'PNG';
      doc.addImage(data.companyLogo, format, imgX, imgY, 16, 16);
    } catch (e) {
      doc.setFillColor(SLIP_AVATAR_BG);
      doc.circle(marginX + 8, y + 4, 8, 'F');
      doc.setFillColor(SLIP_AVATAR_FG);
      doc.circle(marginX + 8, y + 1.5, 2.6, 'F');
      doc.ellipse(marginX + 8, y + 8, 4.6, 2.8, 'F');
    }
  } else {
    doc.setFillColor(SLIP_AVATAR_BG);
    doc.circle(marginX + 8, y + 4, 8, 'F');
    doc.setFillColor(SLIP_AVATAR_FG);
    doc.circle(marginX + 8, y + 1.5, 2.6, 'F');
    doc.ellipse(marginX + 8, y + 8, 4.6, 2.8, 'F');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(SLIP_DARK);
  doc.text(data.companyName || '', marginX + 21, y + 1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(SLIP_MUTED);
  doc.text(data.companyPhone || '', marginX + 21, y + 7);

  doc.text('Pay Slip for', marginX + 21, y + 13);
  const payForWidth = doc.getTextWidth('Pay Slip for ');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(SLIP_DARK);
  doc.text(`${data.payMonth || ''} ${data.payYear || ''}`, marginX + 21 + payForWidth, y + 13);

  y += 17;
  drawDivider(y);
  y += 6;

  // Employee details
  const emp = data.employee || {};
  const empRows = [
    ['Employee Name :', emp.name || ''],
    ['Emirates ID :', emp.emiratesId || ''],
    ['Trade :', emp.trade || ''],
    ['Total Day Worked :', `${emp.totalDaysWorked || 0} Days`],
    ['Total Hour Worked :', `${emp.totalHoursWorked || 0} hr`],
  ];
  doc.setFontSize(10);
  empRows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(SLIP_MUTED);
    doc.text(label, marginX, y);
    doc.setTextColor(SLIP_DARK);
    doc.text(String(value), marginX + 38, y);
    y += 5.4;
  });
  y += 0.4;
  drawDivider(y);

  drawSection(
    'Your Earnings',
    '(This Month)',
    [
      { label: 'Calculated Salary (Rate x Hours)', value: `AED ${Number(data.earnings?.calculatedSalary || 0).toFixed(2)}` },
      { label: 'Additional Allowances', value: `AED ${Number(data.earnings?.additionalAllowances || 0).toFixed(2)}` },
    ],
    { label: 'Gross Salary', value: `AED ${Number(data.earnings?.grossSalary || 0).toFixed(2)}` }
  );

  drawSection(
    'Deductions Amount',
    null,
    (data.deductionRows || []).map((row) => ({ label: row.label, value: `AED ${Number(row.value || 0).toFixed(2)}` })),
    { label: 'Total Deduction', value: `AED ${Number(data.totalDeduction || 0).toFixed(2)}` }
  );

  drawSection(
    'Advance Summary',
    null,
    [
      { label: 'Total Advance Given', value: `AED ${Number(data.advance?.totalGiven || 0).toFixed(2)}` },
      { label: 'This Month Deduction', value: `AED ${Number(data.advance?.thisMonthDeduction || 0).toFixed(2)}` },
    ],
    { label: 'Remaining Advance', value: `AED ${Number(data.advance?.remaining || 0).toFixed(2)}` }
  );

  // Net Salary footer band - fills to the bottom of the A5 page.
  const pageHeight = 210;
  const footerHeight = 20;
  doc.setFillColor(SLIP_FOOTER_BG);
  doc.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(SLIP_DARK);
  doc.text('Net Salary', marginX, pageHeight - 8);
  const netLabelWidth = doc.getTextWidth('Net Salary ');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(11);
  doc.text('(In Hand )', marginX + netLabelWidth, pageHeight - 8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`AED ${Number(data.netSalary || 0).toFixed(2)}`, rightX, pageHeight - 8, { align: 'right' });

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
};

export default { generateSalarySlipPdfBuffer };