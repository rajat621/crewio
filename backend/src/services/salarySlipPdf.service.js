// import fs from 'fs';
// import path from 'path';
// import FileRecord from '../models/FileRecord.js';
// import Company from '../models/Company.js';
// import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// const storageRoot = path.resolve(process.cwd(), 'src', 'storage');

// const toAbsoluteStoragePath = (inputPath) => {
//   if (!inputPath || typeof inputPath !== 'string') return null;
//   const normalized = inputPath.trim();
//   if (normalized.startsWith('data:')) return null;
//   if (normalized.startsWith('/')) {
//     return path.join(storageRoot, normalized.replace(/^\//, ''));
//   }
//   if (path.isAbsolute(normalized)) {
//     return null;
//   }
//   return path.join(storageRoot, normalized.replace(/^[\.\/]+/, '').replace(/^src\/storage\//, ''));
// };

// const decodeDataUri = (value = '') => {
//   const input = String(value || '').trim();
//   if (!input.startsWith('data:')) return null;
//   const match = input.match(/^data:([^;]+);base64,(.+)$/i);
//   if (!match) return null;
//   return {
//     mime: String(match[1] || '').toLowerCase(),
//     bytes: Buffer.from(match[2], 'base64'),
//   };
// };

// const tryResolveLogoBytes = async (company) => {
//   if (!company) return null;

//   // 1) data URI stored directly
//   if (company.logo && typeof company.logo === 'string' && company.logo.startsWith('data:')) {
//     const d = decodeDataUri(company.logo);
//     if (d) return d;
//   }

//   // 2) logoFileId refers to FileRecord stored on disk
//   if (company.logoFileId) {
//     try {
//       const fr = await FileRecord.findById(company.logoFileId).lean();
//       if (fr && fr.path) {
//         const abs = toAbsoluteStoragePath(fr.path);
//         if (abs && fs.existsSync(abs)) {
//           const bytes = fs.readFileSync(abs);
//           return { mime: fr.mimeType || 'image/png', bytes };
//         }
//       }
//     } catch (e) {
//       // continue
//     }
//   }

//   // 3) company.logo might be a relative storage path
//   if (company.logo && typeof company.logo === 'string') {
//     try {
//       const abs = toAbsoluteStoragePath(company.logo);
//       if (abs && fs.existsSync(abs)) {
//         const bytes = fs.readFileSync(abs);
//         const ext = path.extname(abs).toLowerCase();
//         const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
//         return { mime, bytes };
//       }
//     } catch (e) {}
//   }

//   // 4) attempt to fetch remote URL (may fail due to CORS or auth)
//   if (company.logo && typeof company.logo === 'string' && (company.logo.startsWith('http://') || company.logo.startsWith('https://'))) {
//     try {
//       const resp = await fetch(company.logo);
//       if (resp.ok) {
//         const contentType = resp.headers.get('content-type') || 'image/png';
//         const arrayBuffer = await resp.arrayBuffer();
//         return { mime: contentType, bytes: Buffer.from(arrayBuffer) };
//       }
//     } catch (e) {
//       // ignore
//     }
//   }

//   return null;
// };

// export const generateSalarySlipPdfBuffer = async (slipData, options = {}) => {
//   const pdfDoc = await PDFDocument.create();
//   const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
//   const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
//   const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
//   const fontBoldItalic = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

//   // A5 in mm -> points
//   const MM_TO_PT = 2.834645669; // 1 mm = 2.8346 pt
//   const PAGE_W = Math.round(148 * MM_TO_PT);
//   const PAGE_H = Math.round(210 * MM_TO_PT);
//   const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

//   // Light-grey page background with an inset white "card" - matches the
//   // dashboard's own preview styling (see GenerateSalarySlip.jsx).
//   const PAGE_BG = rgb(0.925, 0.925, 0.933);
//   const CARD_INSET = 10;
//   page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAGE_BG });
//   page.drawRectangle({
//     x: CARD_INSET,
//     y: CARD_INSET,
//     width: PAGE_W - CARD_INSET * 2,
//     height: PAGE_H - CARD_INSET * 2,
//     color: rgb(1, 1, 1),
//     borderColor: rgb(0.87, 0.87, 0.89),
//     borderWidth: 1,
//   });

//   const marginX = CARD_INSET + Math.round(9 * MM_TO_PT);
//   let y = CARD_INSET + 16 * MM_TO_PT;

//   // Try to resolve company object if id provided
//   let company = null;
//   if (slipData.companyId) {
//     try { company = await Company.findById(slipData.companyId).lean(); } catch (e) {}
//   }

//   // If slipData contains company snapshot, prefer it
//   const companySnapshot = slipData.company || {};
//   const finalCompany = { ...(company || {}), ...(companySnapshot || {}) };

//   // Resolve logo bytes
//   const logoAsset = await tryResolveLogoBytes(finalCompany);
//   if (logoAsset) {
//     try {
//       const isPng = logoAsset.mime && logoAsset.mime.includes('png');
//       const img = isPng ? await pdfDoc.embedPng(logoAsset.bytes) : await pdfDoc.embedJpg(logoAsset.bytes);
//       const imgDims = img.scaleToFit(46, 46);
//       page.drawImage(img, { x: marginX, y: PAGE_H - y - imgDims.height, width: imgDims.width, height: imgDims.height });
//     } catch (e) {
//       // ignore image errors
//     }
//   } else {
//     // draw neutral avatar circle
//     page.drawEllipse({ x: marginX + 18, y: PAGE_H - y - 18, xScale: 18, yScale: 18, color: rgb(0.78,0.79,0.84) });
//   }

//   // Company name and phone
//   const textX = marginX + 60;
//   page.drawText(finalCompany.companyLegalName || finalCompany.name || slipData.companyName || '', { x: textX, y: PAGE_H - y - 4, size: 14, font: fontBold, color: rgb(0.12,0.18,0.22) });
//   page.drawText(finalCompany.telephoneNumber || finalCompany.mobileNumber || slipData.companyPhone || '', { x: textX, y: PAGE_H - y - 22, size: 9, font: fontRegular, color: rgb(0.4,0.43,0.47) });

//   // Pay Slip label
//   const payLabel = `Pay Slip for ${slipData.payMonth || ''} ${slipData.payYear || ''}`.trim();
//   page.drawText(payLabel, { x: textX, y: PAGE_H - y - 40, size: 10, font: fontRegular, color: rgb(0.4,0.43,0.47) });

//   // Move down and draw divider
//   y += 36;
//   page.drawLine({ start: { x: marginX, y: PAGE_H - y }, end: { x: PAGE_W - marginX, y: PAGE_H - y }, thickness: 0.5, color: rgb(0.9,0.91,0.93) });
//   y += 8;

//   // Employee details block
//   const emp = slipData.employee || {};
//   const rows = [
//     ['Employee Name :', emp.name || ''],
//     ['Emirates ID :', emp.emiratesId || ''],
//     ['Trade :', emp.trade || ''],
//     ['Total Day Worked :', `${emp.totalDaysWorked || 0} Days`],
//     ['Total Hour Worked :', `${emp.totalHoursWorked || 0} hr`],
//   ];

//   let ry = PAGE_H - y - 8;
//   for (const [label, value] of rows) {
//     page.drawText(label, { x: marginX, y: ry, size: 10, font: fontRegular, color: rgb(0.45,0.47,0.5) });
//     page.drawText(String(value), { x: marginX + 120, y: ry, size: 10, font: fontBold, color: rgb(0.12,0.18,0.22) });
//     ry -= 16;
//   }

//   // Sections (earnings, deductions, advance)
//   const sectionStartY = ry - 8;
//   let sy = sectionStartY;

//   const drawSection = (heading, suffix, rowsData, totalLabel, totalValue) => {
//     page.drawText(heading, { x: marginX, y: sy, size: 12, font: fontBold, color: rgb(0.12,0.18,0.22) });
//     if (suffix) {
//       const headingWidth = fontBold.widthOfTextAtSize(heading, 12);
//       page.drawText(` ${suffix}`, { x: marginX + headingWidth, y: sy, size: 10, font: fontItalic, color: rgb(0.5,0.52,0.56) });
//     }
//     sy -= 6;
//     page.drawLine({ start: { x: marginX, y: sy }, end: { x: PAGE_W - marginX, y: sy }, thickness: 0.5, color: rgb(0.9,0.91,0.93) });
//     sy -= 12;
//     for (const r of rowsData) {
//       page.drawText(r.label, { x: marginX, y: sy, size: 10, font: fontRegular, color: rgb(0.45,0.47,0.5) });
//       page.drawText(r.value, { x: PAGE_W - marginX - 60, y: sy, size: 10, font: fontRegular, color: rgb(0.12,0.18,0.22) });
//       sy -= 13;
//     }
//     sy -= 4;
//     page.drawText(totalLabel, { x: marginX, y: sy, size: 11, font: fontBold, color: rgb(0.12,0.18,0.22) });
//     page.drawText(totalValue, { x: PAGE_W - marginX - 60, y: sy, size: 11, font: fontBold, color: rgb(0.12,0.18,0.22) });
//     sy -= 20;
//   };

//   drawSection('Your Earnings', '(This Month)', [
//     { label: 'Calculated Salary (Rate x Hours)', value: `AED ${Number(slipData.earnings?.calculatedSalary || 0).toFixed(2)}` },
//     { label: 'Additional Allowances', value: `AED ${Number(slipData.earnings?.additionalAllowances || 0).toFixed(2)}` },
//   ], 'Gross Salary', `AED ${Number(slipData.earnings?.grossSalary || 0).toFixed(2)}`);

//   drawSection('Deductions Amount', null, (slipData.deductionRows || []).map(r => ({ label: r.label, value: `AED ${Number(r.value || 0).toFixed(2)}` })), 'Total Deduction', `AED ${Number(slipData.totalDeduction || 0).toFixed(2)}`);

//   drawSection('Advance Summary', null, [
//     { label: 'Total Advance Given', value: `AED ${Number(slipData.advance?.totalGiven || 0).toFixed(2)}` },
//     { label: 'This Month Deduction', value: `AED ${Number(slipData.advance?.thisMonthDeduction || 0).toFixed(2)}` },
//   ], 'Remaining Advance', `AED ${Number(slipData.advance?.remaining || 0).toFixed(2)}`);

//   // Net salary footer band - a purple-tinted bar inset within the card,
//   // matching the dashboard preview's "Net Salary (In Hand)" bar.
//   const footerHeight = 30;
//   page.drawRectangle({
//     x: CARD_INSET,
//     y: CARD_INSET,
//     width: PAGE_W - CARD_INSET * 2,
//     height: footerHeight,
//     color: rgb(0.949, 0.945, 0.996),
//   });
//   page.drawText('Net Salary', { x: marginX, y: CARD_INSET + 11, size: 12, font: fontBold, color: rgb(0.12,0.18,0.22) });
//   const netLabelWidth = fontBold.widthOfTextAtSize('Net Salary', 12);
//   page.drawText(' (In Hand)', { x: marginX + netLabelWidth, y: CARD_INSET + 11, size: 10, font: fontItalic, color: rgb(0.4,0.35,0.55) });
//   const netValueText = `AED ${Number(slipData.netSalary || 0).toFixed(2)}`;
//   const netValueWidth = fontBold.widthOfTextAtSize(netValueText, 14);
//   page.drawText(netValueText, { x: PAGE_W - marginX - netValueWidth, y: CARD_INSET + 10, size: 14, font: fontBold, color: rgb(0.12,0.18,0.22) });

//   const bytes = await pdfDoc.save();
//   return Buffer.from(bytes);
// };

// export default { generateSalarySlipPdfBuffer };
import fs from 'fs';
import path from 'path';
import FileRecord from '../models/FileRecord.js';
import Company from '../models/Company.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const storageRoot = path.resolve(process.cwd(), 'src', 'storage');

const toAbsoluteStoragePath = (inputPath) => {
  if (!inputPath || typeof inputPath !== 'string') return null;
  const normalized = inputPath.trim();
  if (normalized.startsWith('data:')) return null;
  if (normalized.startsWith('/')) {
    return path.join(storageRoot, normalized.replace(/^\//, ''));
  }
  if (path.isAbsolute(normalized)) {
    return null;
  }
  return path.join(storageRoot, normalized.replace(/^[\.\/]+/, '').replace(/^src\/storage\//, ''));
};

const decodeDataUri = (value = '') => {
  const input = String(value || '').trim();
  if (!input.startsWith('data:')) return null;
  const match = input.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  return {
    mime: String(match[1] || '').toLowerCase(),
    bytes: Buffer.from(match[2], 'base64'),
  };
};

export const tryResolveLogoBytes = async (company) => {
  if (!company) return null;

  // 1) data URI stored directly
  if (company.logo && typeof company.logo === 'string' && company.logo.startsWith('data:')) {
    const d = decodeDataUri(company.logo);
    if (d) return d;
  }

  // 2) logoFileId refers to FileRecord stored on disk
  if (company.logoFileId) {
    try {
      const fr = await FileRecord.findById(company.logoFileId).lean();
      if (fr && fr.path) {
        const abs = toAbsoluteStoragePath(fr.path);
        if (abs && fs.existsSync(abs)) {
          const bytes = fs.readFileSync(abs);
          return { mime: fr.mimeType || 'image/png', bytes };
        }
      }
    } catch (e) {
      // continue
    }
  }

  // 3) company.logo might be a relative storage path
  if (company.logo && typeof company.logo === 'string') {
    try {
      const abs = toAbsoluteStoragePath(company.logo);
      if (abs && fs.existsSync(abs)) {
        const bytes = fs.readFileSync(abs);
        const ext = path.extname(abs).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        return { mime, bytes };
      }
    } catch (e) {}
  }

  // 4) attempt to fetch remote URL (may fail due to CORS or auth)
  if (company.logo && typeof company.logo === 'string' && (company.logo.startsWith('http://') || company.logo.startsWith('https://'))) {
    try {
      const resp = await fetch(company.logo);
      if (resp.ok) {
        const contentType = resp.headers.get('content-type') || 'image/png';
        const arrayBuffer = await resp.arrayBuffer();
        return { mime: contentType, bytes: Buffer.from(arrayBuffer) };
      }
    } catch (e) {
      // ignore
    }
  }

  return null;
};

export const generateSalarySlipPdfBuffer = async (slipData, options = {}) => {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fontBoldItalic = await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique);

  // A5 in mm -> points
  const MM_TO_PT = 2.834645669; // 1 mm = 2.8346 pt
  const PAGE_W = Math.round(148 * MM_TO_PT);
  const PAGE_H = Math.round(210 * MM_TO_PT);
  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // Light-grey page background with an inset white "card" - matches the
  // dashboard's own preview styling (see GenerateSalarySlip.jsx).
  const PAGE_BG = rgb(0.925, 0.925, 0.933);
  const CARD_INSET = 10;
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: PAGE_BG });
  page.drawRectangle({
    x: CARD_INSET,
    y: CARD_INSET,
    width: PAGE_W - CARD_INSET * 2,
    height: PAGE_H - CARD_INSET * 2,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.87, 0.87, 0.89),
    borderWidth: 1,
  });

  const marginX = CARD_INSET + Math.round(9 * MM_TO_PT);
  let y = CARD_INSET + 16 * MM_TO_PT;

  // Try to resolve company object if id provided
  let company = null;
  if (slipData.companyId) {
    try { company = await Company.findById(slipData.companyId).lean(); } catch (e) {}
  }

  // If slipData contains company snapshot, prefer it
  const companySnapshot = slipData.company || {};
  const finalCompany = { ...(company || {}), ...(companySnapshot || {}) };

  // Resolve logo bytes
  const logoAsset = await tryResolveLogoBytes(finalCompany);
  if (logoAsset) {
    try {
      const isPng = logoAsset.mime && logoAsset.mime.includes('png');
      const img = isPng ? await pdfDoc.embedPng(logoAsset.bytes) : await pdfDoc.embedJpg(logoAsset.bytes);
      const imgDims = img.scaleToFit(46, 46);
      page.drawImage(img, { x: marginX, y: PAGE_H - y - imgDims.height, width: imgDims.width, height: imgDims.height });
    } catch (e) {
      // ignore image errors
    }
  } else {
    // draw neutral avatar circle
    page.drawEllipse({ x: marginX + 18, y: PAGE_H - y - 18, xScale: 18, yScale: 18, color: rgb(0.78,0.79,0.84) });
  }

  // Company name and phone
  const textX = marginX + 60;
  page.drawText(finalCompany.companyLegalName || finalCompany.name || slipData.companyName || '', { x: textX, y: PAGE_H - y - 4, size: 14, font: fontBold, color: rgb(0.12,0.18,0.22) });
  page.drawText(finalCompany.telephoneNumber || finalCompany.mobileNumber || slipData.companyPhone || '', { x: textX, y: PAGE_H - y - 22, size: 9, font: fontRegular, color: rgb(0.4,0.43,0.47) });

  // Pay Slip label
  const payLabel = `Pay Slip for ${slipData.payMonth || ''} ${slipData.payYear || ''}`.trim();
  page.drawText(payLabel, { x: textX, y: PAGE_H - y - 40, size: 10, font: fontRegular, color: rgb(0.4,0.43,0.47) });

  // Move down and draw divider
  y += 36;
  page.drawLine({ start: { x: marginX, y: PAGE_H - y }, end: { x: PAGE_W - marginX, y: PAGE_H - y }, thickness: 0.5, color: rgb(0.9,0.91,0.93) });
  y += 8;

  // Employee details block
  const emp = slipData.employee || {};
  const rows = [
    ['Employee Name :', emp.name || ''],
    ['Emirates ID :', emp.emiratesId || ''],
    ['Trade :', emp.trade || ''],
    ['Total Day Worked :', `${emp.totalDaysWorked || 0} Days`],
    ['Total Hour Worked :', `${emp.totalHoursWorked || 0} hr`],
  ];

  let ry = PAGE_H - y - 8;
  for (const [label, value] of rows) {
    page.drawText(label, { x: marginX, y: ry, size: 10, font: fontRegular, color: rgb(0.45,0.47,0.5) });
    page.drawText(String(value), { x: marginX + 120, y: ry, size: 10, font: fontBold, color: rgb(0.12,0.18,0.22) });
    ry -= 16;
  }

  // Sections (earnings, deductions, advance)
  const sectionStartY = ry - 8;
  let sy = sectionStartY;

  const drawSection = (heading, suffix, rowsData, totalLabel, totalValue) => {
    page.drawText(heading, { x: marginX, y: sy, size: 12, font: fontBold, color: rgb(0.12,0.18,0.22) });
    if (suffix) {
      const headingWidth = fontBold.widthOfTextAtSize(heading, 12);
      page.drawText(` ${suffix}`, { x: marginX + headingWidth, y: sy, size: 10, font: fontItalic, color: rgb(0.5,0.52,0.56) });
    }
    sy -= 6;
    page.drawLine({ start: { x: marginX, y: sy }, end: { x: PAGE_W - marginX, y: sy }, thickness: 0.5, color: rgb(0.9,0.91,0.93) });
    sy -= 12;
    for (const r of rowsData) {
      page.drawText(r.label, { x: marginX, y: sy, size: 10, font: fontRegular, color: rgb(0.45,0.47,0.5) });
      page.drawText(r.value, { x: PAGE_W - marginX - 60, y: sy, size: 10, font: fontRegular, color: rgb(0.12,0.18,0.22) });
      sy -= 13;
    }
    sy -= 4;
    page.drawText(totalLabel, { x: marginX, y: sy, size: 11, font: fontBold, color: rgb(0.12,0.18,0.22) });
    page.drawText(totalValue, { x: PAGE_W - marginX - 60, y: sy, size: 11, font: fontBold, color: rgb(0.12,0.18,0.22) });
    sy -= 20;
  };

  drawSection('Your Earnings', '(This Month)', [
    { label: 'Calculated Salary (Rate x Hours)', value: `AED ${Number(slipData.earnings?.calculatedSalary || 0).toFixed(2)}` },
    { label: 'Additional Allowances', value: `AED ${Number(slipData.earnings?.additionalAllowances || 0).toFixed(2)}` },
  ], 'Gross Salary', `AED ${Number(slipData.earnings?.grossSalary || 0).toFixed(2)}`);

  drawSection('Deductions Amount', null, (slipData.deductionRows || []).map(r => ({ label: r.label, value: `AED ${Number(r.value || 0).toFixed(2)}` })), 'Total Deduction', `AED ${Number(slipData.totalDeduction || 0).toFixed(2)}`);

  drawSection('Advance Summary', null, [
    { label: 'Total Advance Given', value: `AED ${Number(slipData.advance?.totalGiven || 0).toFixed(2)}` },
    { label: 'This Month Deduction', value: `AED ${Number(slipData.advance?.thisMonthDeduction || 0).toFixed(2)}` },
  ], 'Remaining Advance', `AED ${Number(slipData.advance?.remaining || 0).toFixed(2)}`);

  // Net salary footer band - a purple-tinted bar inset within the card,
  // matching the dashboard preview's "Net Salary (In Hand)" bar.
  const footerHeight = 30;
  page.drawRectangle({
    x: CARD_INSET,
    y: CARD_INSET,
    width: PAGE_W - CARD_INSET * 2,
    height: footerHeight,
    color: rgb(0.949, 0.945, 0.996),
  });
  page.drawText('Net Salary', { x: marginX, y: CARD_INSET + 11, size: 12, font: fontBold, color: rgb(0.12,0.18,0.22) });
  const netLabelWidth = fontBold.widthOfTextAtSize('Net Salary', 12);
  page.drawText(' (In Hand)', { x: marginX + netLabelWidth, y: CARD_INSET + 11, size: 10, font: fontItalic, color: rgb(0.4,0.35,0.55) });
  const netValueText = `AED ${Number(slipData.netSalary || 0).toFixed(2)}`;
  const netValueWidth = fontBold.widthOfTextAtSize(netValueText, 14);
  page.drawText(netValueText, { x: PAGE_W - marginX - netValueWidth, y: CARD_INSET + 10, size: 14, font: fontBold, color: rgb(0.12,0.18,0.22) });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
};

export default { generateSalarySlipPdfBuffer };