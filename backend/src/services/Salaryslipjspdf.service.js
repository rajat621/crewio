import { jsPDF } from 'jspdf';
import Company from '../models/Company.js';
import { tryResolveLogoBytes } from './salarySlipPdf.service.js';
import { optimizeImageForPdf } from '../utils/pdfImageOptimizer.js';

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
//
// D19.7 finding (real, cross-tenant): `slipData` for a stored slip is
// `SalarySlip.slipData`, a snapshot blob accepted from `req.body` at
// creation time (see createSalarySlip) and persisted verbatim -
// `slipData.companyId`/`slipData.company` are therefore client-supplied,
// not server-derived. Previously this looked up `Company.findById(
// slipData.companyId)` with no tenant scope at all, and separately built
// `finalCompany.ownerId` from that same untrusted lookup's own `ownerId`
// field (or the equally untrusted `slipData.company` snapshot) before
// handing it to `tryResolveLogoBytes()` - so even that function's own
// ownerId-scoped `FileRecord` query (see salarySlipPdf.service.js) was
// being scoped by attacker-influenced data, not the real requester's
// tenant. Net effect: an owner could set an arbitrary `companyId`/`company`
// snapshot on their own salary slip at creation time and have another
// tenant's company logo/branding asset silently embedded into their PDF
// download - a real cross-tenant confidentiality leak, not theoretical.
// Fixed by requiring the caller's own verified `ownerId` (see
// generateSalarySlipPdfBuffer below) and using it - not any
// client-supplied value - for both the Company lookup and the ownerId
// handed to tryResolveLogoBytes.
const resolveCompanyLogoDataUri = async (slipData, ownerId) => {
  if (slipData.companyLogo && typeof slipData.companyLogo === 'string' && slipData.companyLogo.startsWith('data:')) {
    const match = slipData.companyLogo.match(/^data:([^;]+);base64,(.+)$/i);
    if (match) {
      const optimized = await optimizeImageForPdf(Buffer.from(match[2], 'base64'), match[1].toLowerCase());
      return `data:${optimized.mime};base64,${optimized.bytes.toString('base64')}`;
    }
    return slipData.companyLogo;
  }

  let company = null;
  if (slipData.companyId && ownerId) {
    try {
      company = await Company.findOne({ _id: slipData.companyId, ownerId }).lean();
    } catch (e) {
      // ignore - fall through to whatever snapshot fields we have
    }
  }
  const companySnapshot = slipData.company || {};
  const finalCompany = {
    ...(company || {}),
    ...(companySnapshot || {}),
    // Always the caller-verified tenant, never whatever `company`/
    // `companySnapshot` happen to carry - see finding above.
    ownerId,
    // `logo` is intentionally restricted to ONLY the value from the
    // ownerId-scoped `company` lookup above (or omitted entirely) - never
    // `slipData.companyLogo`/`companySnapshot.logo` when it isn't already
    // a `data:` URI (that case returns early above). Those are raw,
    // unvalidated client input from slip creation. `tryResolveLogoBytes`
    // below has two branches that trust `company.logo` as either a raw
    // storage key (read directly from disk/R2 with no further scoping) or
    // a remote URL (fetched server-side, no allowlist) - handing either
    // branch attacker-controlled input would mean arbitrary cross-tenant
    // file disclosure (predictable `owners/<ownerId>/...` storage keys)
    // or SSRF (fetch() of any URL, including internal network targets).
    // The real `Company.logo` field is always a `data:` URI in practice
    // (enforced by validateAssetField in company.controller.js), so this
    // restriction changes no legitimate behavior.
    logo: company?.logo || null,
  };

  const asset = await tryResolveLogoBytes(finalCompany);
  if (!asset) return null;
  const optimized = await optimizeImageForPdf(asset.bytes, asset.mime);
  return `data:${optimized.mime};base64,${optimized.bytes.toString('base64')}`;
};

// `ownerId` is required and must come from the caller's own verified
// identity (e.g. req.user.ownerId / req.employee.ownerId) - never from
// `rawData`/`slipData` itself. See the finding above resolveCompanyLogoDataUri.
export const generateSalarySlipPdfBuffer = async (rawData, ownerId) => {
  const data = { ...rawData };
  data.companyLogo = await resolveCompanyLogoDataUri(rawData, ownerId);

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