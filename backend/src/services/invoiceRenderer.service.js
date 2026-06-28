import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const fmt = (value) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const formatCurrency = (value, currencyCode = 'AED') => {
  const num = Number(value || 0);
  const safe = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
};

const SMALL = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const integerToWords = (n) => {
  const value = Number(n || 0);
  if (value < 20) return SMALL[value];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const rest = value % 10;
    return rest ? `${TENS[tens]}-${SMALL[rest]}` : TENS[tens];
  }
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;
    return rest ? `${SMALL[hundreds]} hundred ${integerToWords(rest)}` : `${SMALL[hundreds]} hundred`;
  }
  if (value < 1000000) {
    const thousands = Math.floor(value / 1000);
    const rest = value % 1000;
    return rest ? `${integerToWords(thousands)} thousand ${integerToWords(rest)}` : `${integerToWords(thousands)} thousand`;
  }
  const millions = Math.floor(value / 1000000);
  const rest = value % 1000000;
  return rest ? `${integerToWords(millions)} million ${integerToWords(rest)}` : `${integerToWords(millions)} million`;
};

const amountToWords = (value, currencyCode = 'AED') => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return `Zero ${currencyCode} only`;
  const absolute = Math.abs(num);
  const major = Math.floor(absolute);
  const minor = Math.round((absolute - major) * 100);
  const majorWords = integerToWords(major);
  const minorWords = minor > 0 ? ` and ${integerToWords(minor)} fils` : '';
  return `${majorWords.charAt(0).toUpperCase()}${majorWords.slice(1)} ${currencyCode}${minorWords} only`;
};

const ext = (targetPath = '') => path.extname(String(targetPath || '')).toLowerCase();

const decodeDataUri = (value = '') => {
  const input = String(value || '').trim();
  if (!input.startsWith('data:')) {
    return null;
  }
  const match = input.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    mime: String(match[1] || '').toLowerCase(),
    bytes: Buffer.from(match[2], 'base64'),
  };
};

const wrapText = (font, text, size, maxWidth) => {
  const safe = String(text || '').trim();
  if (!safe) return [''];

  const words = safe.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
    } else {
      // Hard split long token to keep it inside border.
      let token = word;
      while (token.length > 0) {
        let chunk = token;
        while (chunk.length > 1 && font.widthOfTextAtSize(chunk, size) > maxWidth) {
          chunk = chunk.slice(0, -1);
        }
        lines.push(chunk);
        token = token.slice(chunk.length);
      }
      current = '';
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length ? lines : [''];
};

const drawCellText = ({ page, font, text, x, yTop, width, rowHeight, fontSize = 9, align = 'left', padding = 3, vAlign = 'middle' }) => {
  const lines = wrapText(font, text, fontSize, Math.max(5, width - padding * 2));
  const lineHeight = fontSize + 1.5;
  const maxLines = Math.max(1, Math.floor((rowHeight - padding * 2) / lineHeight));
  const visible = lines.slice(0, maxLines);
  const textBlockHeight = visible.length * lineHeight;

  let y = yTop - padding - fontSize;
  if (vAlign === 'middle') {
    const offset = (rowHeight - textBlockHeight) / 2;
    y = yTop - offset - fontSize + 1;
  }

  for (const line of visible) {
    let drawX = x + padding;
    if (align === 'center') {
      const lineWidth = font.widthOfTextAtSize(line, fontSize);
      drawX = x + (width - lineWidth) / 2;
    }
    if (align === 'right') {
      const lineWidth = font.widthOfTextAtSize(line, fontSize);
      drawX = x + width - padding - lineWidth;
    }
    page.drawText(line, { x: drawX, y, size: fontSize, font, color: rgb(0, 0, 0) });
    y -= lineHeight;
  }

  return visible.length;
};

const imageBytesIfExists = (targetPath) => {
  const dataAsset = decodeDataUri(targetPath);
  if (dataAsset) {
    if (!dataAsset.mime.startsWith('image/')) {
      return null;
    }
    return dataAsset;
  }
  if (!targetPath || !fs.existsSync(targetPath)) {
    return null;
  }
  const extension = ext(targetPath);
  if (!['.png', '.jpg', '.jpeg'].includes(extension)) {
    return null;
  }
  try {
    return {
      mime: extension === '.png' ? 'image/png' : 'image/jpeg',
      bytes: fs.readFileSync(targetPath),
    };
  } catch {
    return null;
  }
};

const printablePdfText = (bytes) => {
  try {
    const raw = Buffer.from(bytes).toString('latin1');
    const parenChunks = [...raw.matchAll(/\(([^()]{2,180})\)/g)].map((m) =>
      String(m[1] || '')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\n/g, ' ')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ')
    );
    const asciiChunks = [...raw.matchAll(/[A-Za-z][A-Za-z0-9\s\-\/:().,&]{3,120}/g)].map((m) => String(m[0] || ''));
    return `${parenChunks.join(' ')} ${asciiChunks.join(' ')}`.replace(/\s+/g, ' ').trim().toLowerCase();
  } catch {
    return '';
  }
};

const detectZones = (pageWidth, pageHeight, templateConfig = {}) => {
  const safeLeft = Number(templateConfig.safeContentLeft ?? Math.round(pageWidth * 0.06));
  const safeRight = Number(templateConfig.safeContentRight ?? Math.round(pageWidth * 0.06));
  const headerBoundaryY = Number(templateConfig.headerBoundaryY ?? Math.round(pageHeight * 0.14));
  const footerBoundaryY = Number(templateConfig.footerBoundaryY ?? Math.round(pageHeight * 0.13));
  const tableStartY = Number(templateConfig.tableStartY ?? Math.round(pageHeight * 0.36));

  const contentLeft = clamp(safeLeft, 20, pageWidth - 120);
  const contentRight = clamp(pageWidth - safeRight, contentLeft + 100, pageWidth - 20);
  const contentWidth = contentRight - contentLeft;

  return {
    contentLeft,
    contentRight,
    contentWidth,
    headerTop: pageHeight - headerBoundaryY,
    tableTop: pageHeight - tableStartY,
    footerFloor: footerBoundaryY,
    signatureAreaX: Number(templateConfig.signatureAreaX ?? (contentLeft + 8)),
    signatureAreaY: Number(templateConfig.signatureAreaY ?? (footerBoundaryY + 6)),
    signatureAreaWidth: Number(templateConfig.signatureAreaWidth ?? 150),
    signatureAreaHeight: Number(templateConfig.signatureAreaHeight ?? 90),
    tableLeft: Number(templateConfig.tableLeft ?? contentLeft),
    tableRight: Number(templateConfig.tableRight ?? contentRight),
    tableBottom: Number(templateConfig.tableBottom ?? (footerBoundaryY + 140)),
    invoiceNoX: Number(templateConfig.invoiceNoX ?? contentLeft),
    invoiceNoY: Number(templateConfig.invoiceNoY ?? (pageHeight - headerBoundaryY + 24)),
    invoiceDateX: Number(templateConfig.invoiceDateX ?? (contentRight - 170)),
    invoiceDateY: Number(templateConfig.invoiceDateY ?? (pageHeight - headerBoundaryY + 24)),
    titleX: Number(templateConfig.titleX ?? (contentLeft + contentWidth / 2)),
    titleY: Number(templateConfig.titleY ?? (pageHeight - headerBoundaryY + 48)),
    monthLabelX: Number(templateConfig.monthLabelX ?? (contentLeft + contentWidth / 2)),
    monthLabelY: Number(templateConfig.monthLabelY ?? (pageHeight - tableStartY + 26)),
    clientBlockX: Number(templateConfig.clientBlockX ?? contentLeft),
    clientBlockY: Number(templateConfig.clientBlockY ?? (pageHeight - headerBoundaryY - 4)),
    totalsX: Number(templateConfig.totalsX ?? (contentRight - 220)),
    totalsY: Number(templateConfig.totalsY ?? (pageHeight - tableStartY - 170)),
    totalsWidth: Number(templateConfig.totalsWidth ?? 220),
  };
};

const fitImageWithin = (img, areaW, areaH) => {
  const iw = Number(img.width || 1);
  const ih = Number(img.height || 1);
  const scale = Math.min(areaW / iw, areaH / ih);
  return {
    width: Math.max(1, iw * scale),
    height: Math.max(1, ih * scale),
  };
};

const isValidIdentifier = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  const upper = text.toUpperCase();
  if (upper === 'N/A' || upper === 'NA' || upper === '-') return false;
  if (upper.startsWith('ROW-')) return false;
  return true;
};

const extractIdentifier = (item = {}) => {
  const candidate =
    item.project ||
    item.identifier ||
    item.employee_id ||
    item.emp_id ||
    item.worker_id ||
    item.code ||
    item.id_no ||
    item.id;
  const text = String(candidate || '').trim();
  return isValidIdentifier(text) ? text : '';
};

const buildColumns = ({ rows, contentWidth, includeIdentifier, profile }) => {
  const layout = includeIdentifier
    ? profile.columnLayout.includeIdentifier.columns
    : profile.columnLayout.withoutIdentifier.columns;

  const fixedWidth = layout
    .filter((col) => typeof col.width === 'number')
    .reduce((sum, col) => sum + Number(col.width), 0);

  const flexible = layout.filter((col) => typeof col.width !== 'number');

  const maxLenByKey = {};
  for (const col of layout) {
    maxLenByKey[col.key] = Math.max(6, ...rows.map((row) => String(row[col.key] || '').length));
  }

  const flexibleBase = flexible.reduce((sum, col) => {
    const min = Number(col.min || 70);
    const max = Number(col.max || min);
    const weight = Number(col.weight || 1);
    const dynamic = clamp(min + maxLenByKey[col.key] * weight, min, max);
    return sum + dynamic;
  }, 0);

  const targetFlexible = Math.max(0, contentWidth - fixedWidth);
  const ratio = flexibleBase > 0 ? targetFlexible / flexibleBase : 1;

  const cols = layout.map((col) => {
    if (typeof col.width === 'number') {
      return {
        key: col.key,
        label: col.label,
        align: col.align || 'left',
        width: Number(col.width),
      };
    }

    const min = Number(col.min || 70);
    const max = Number(col.max || min);
    const weight = Number(col.weight || 1);
    const dynamic = clamp(min + maxLenByKey[col.key] * weight, min, max);
    const scaled = clamp(dynamic * ratio, min, max);

    return {
      key: col.key,
      label: col.label,
      align: col.align || 'left',
      width: scaled,
    };
  });

  const total = cols.reduce((sum, col) => sum + col.width, 0);
  if (total < contentWidth) {
    const growTarget = cols.find((col) => col.key === 'description') || cols[0];
    growTarget.width += contentWidth - total;
  }

  if (total > contentWidth) {
    const shrinkable = cols.filter((col) => col.key === 'description' || col.key === 'project');
    let overflow = total - contentWidth;
    for (const col of shrinkable) {
      const min = col.key === 'description' ? 150 : 70;
      const cut = Math.min(overflow, Math.max(0, col.width - min));
      col.width -= cut;
      overflow -= cut;
      if (overflow <= 0) break;
    }
  }

  return cols.map((col) => ({ ...col, width: Math.round(col.width) }));
};

const computeBodyFontSize = ({ rowCount, tableHeight, rowMinHeight, minSize, maxSize }) => {
  const safeHeight = Math.max(100, Number(tableHeight || 0));
  const rowsAtMax = Math.max(1, Math.floor(safeHeight / Math.max(1, rowMinHeight || 18)));
  if (rowCount <= rowsAtMax) return maxSize;

  const ratio = rowCount / rowsAtMax;
  const drop = Math.min(2.5, (ratio - 1) * 2.2);
  return clamp(maxSize - drop, minSize, maxSize);
};

const drawWhiteContentCanvas = (page, zones) => {
  const canvasX = Number(zones.contentLeft || 40);
  const canvasRight = Number(zones.contentRight || (page.getWidth() - 40));
  const canvasBottom = Number(zones.contentBottom || zones.contentEndY || 80);
  const canvasTop = Number(zones.contentTop || zones.contentStartY || (page.getHeight() - 90));
  const canvasWidth = Math.max(1, canvasRight - canvasX);
  const canvasHeight = Math.max(1, canvasTop - canvasBottom);

  page.drawRectangle({
    x: canvasX,
    y: canvasBottom,
    width: canvasWidth,
    height: canvasHeight,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
};

export const renderInvoicePdf = async ({
  invoiceNumber,
  invoiceDate,
  invoiceMonthYear,
  company,
  client,
  items,
  subtotal,
  vatRate,
  total,
  totalDeduction = 0,
  financials = {},
  templatePath,
  signaturePath,
  stampPath,
  outputPath,
}) => {
  const rendererRows = Array.isArray(items) ? items : [];
  console.log('ROWS BEFORE RENDER', rendererRows);

  const outDir = path.dirname(outputPath);
  ensureDir(outDir);

  const finalSubtotal = Number(financials?.subtotal ?? subtotal ?? 0);
  const finalDeduction = Number(financials?.total_deduction ?? totalDeduction ?? 0);
  const finalDeductionVat = Number(financials?.deduction_vat ?? 0);
  const finalDeductionImpact = Number(financials?.deduction_total_with_vat ?? (finalDeduction + finalDeductionVat));
  const finalAdjustedSubtotal = Number(financials?.adjusted_subtotal ?? (finalSubtotal - finalDeduction));
  const finalVat = Number(financials?.total_vat ?? 0);
  const finalNet = Number(financials?.net_payable ?? total ?? 0);
  const deductionSource = String(financials?.deduction_source || '');
  const summaryDetected = Boolean(financials?.summary_detected);
  const hasAnyIdentifier = (items || []).some((item) => isValidIdentifier(item.identifier || item.project || ''));

  if (summaryDetected && finalDeduction <= 0 && deductionSource) {
    throw new Error('financial integrity violation: summary deduction lost before backend renderer');
  }

  const expectedFinalNet = Number((finalAdjustedSubtotal + finalVat).toFixed(2));
  const actualFinalNet = Number(finalNet.toFixed(2));
  if (Math.abs(expectedFinalNet - actualFinalNet) > 0.01) {
    throw new Error(`consistency assertion failed: net_payable ${actualFinalNet} != adjusted_subtotal+vat ${expectedFinalNet}`);
  }

  const expectedDeductionImpact = Number((finalDeduction + finalDeductionVat).toFixed(3));
  const actualDeductionImpact = Number(finalDeductionImpact.toFixed(3));
  if (Math.abs(expectedDeductionImpact - actualDeductionImpact) > 0.001) {
    throw new Error(`consistency assertion failed: deduction_total_with_vat ${actualDeductionImpact} != total_deduction+deduction_vat ${expectedDeductionImpact}`);
  }

  // ── PDF document setup ──────────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ── Template page ───────────────────────────────────────────────────────────
  // A4 default
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;

  let page;
  const tDataUri = decodeDataUri(templatePath || '');
  if (tDataUri) {
    if (tDataUri.mime === 'application/pdf') {
      const tDoc = await PDFDocument.load(tDataUri.bytes);
      const [tPage] = await pdfDoc.copyPages(tDoc, [0]);
      page = pdfDoc.addPage(tPage);
    } else {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      const tImg = tDataUri.mime.includes('png')
        ? await pdfDoc.embedPng(tDataUri.bytes)
        : await pdfDoc.embedJpg(tDataUri.bytes);
      page.drawImage(tImg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    }
  } else if (templatePath && fs.existsSync(templatePath)) {
    const tExt = path.extname(String(templatePath)).toLowerCase();
    if (tExt === '.pdf') {
      const tDoc = await PDFDocument.load(fs.readFileSync(templatePath));
      const [tPage] = await pdfDoc.copyPages(tDoc, [0]);
      page = pdfDoc.addPage(tPage);
    } else {
      // PNG or JPG image template
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      const imgBytes = fs.readFileSync(templatePath);
      const tImg = tExt === '.png'
        ? await pdfDoc.embedPng(imgBytes)
        : await pdfDoc.embedJpg(imgBytes);
      page.drawImage(tImg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    }
  } else {
    // No template — plain white page
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(1, 1, 1) });
  }

  // Use actual page dimensions (handles non-A4 PDF templates)
  const PW = page.getWidth();
  const PH = page.getHeight();

  // ── Safe content zones for the template_bg.png layout ──────────────────────
  // Template strip measured at pixel x=217 in 1489px image → 86.8 PDF pts.
  // Add 23pt gap so content starts well clear of the strip + label blocks.
  const LEFT_BORDER_W = Math.round(PW * 0.146); // ~87pt — actual strip right edge
  const SIDE_GUTTER   = 23;                       // comfortable gap after strip
  const CL  = LEFT_BORDER_W + SIDE_GUTTER;        // ~110pt from left
  const CR  = PW - 40;                            // 40pt right margin
  const CW  = CR - CL;                            // ~445pt content width
  const HDR_END = Math.round(PH * 0.871);
  const FTR_TOP = Math.round(PH * 0.068);

  // Keep template background visible (including watermark) behind content.

  // ── 1. "Tax Invoice" centred title ─────────────────────────────────────────
  const TITLE       = 'Tax Invoice';
  const TITLE_SIZE  = 13;
  const titleY      = HDR_END - 19;
  const titleTxtW   = fontBold.widthOfTextAtSize(TITLE, TITLE_SIZE);
  page.drawText(TITLE, {
    x: CL + (CW - titleTxtW) / 2,
    y: titleY,
    size: TITLE_SIZE,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // ── 2. Invoice number (left) + Date (right) ─────────────────────────────────
  const invLineY = titleY - 19;
  page.drawText(String(invoiceNumber || ''), {
    x: CL, y: invLineY, size: 10, font: fontBold, color: rgb(0, 0, 0),
  });
  const dateStr  = `Date. ${invoiceDate || ''}`;
  const dateTxtW = fontBold.widthOfTextAtSize(dateStr, 10);
  page.drawText(dateStr, {
    x: CR - dateTxtW, y: invLineY, size: 10, font: fontBold, color: rgb(0, 0, 0),
  });

  // ── 3. Client ("Bill To") block ─────────────────────────────────────────────
  const CLIENT_LINE_GAP = 14;
  const clientLines = [
    client?.name    ? `M/s. ${client.name}` : null,
    client?.poBox   ? `PO Box ${client.poBox}` : null,
    client?.phone   ? `Tel No ${client.phone}` : null,
    client?.fax     ? `Fax no # ${client.fax}` : null,
    client?.address || null,
    client?.city    || null,
    client?.trn     ? `TRN: ${client.trn}` : null,
  ].filter(Boolean);

  let curY = invLineY - 22;
  for (let i = 0; i < clientLines.length; i++) {
    page.drawText(clientLines[i], {
      x: CL,
      y: curY,
      size: 10,
      font: i === 0 ? fontBold : fontRegular,
      color: rgb(0, 0, 0),
    });
    curY -= CLIENT_LINE_GAP;
  }

  // ── 4. "Invoice for the month of…" label ────────────────────────────────────
  const monthLabelY  = curY - 18;
  const monthText    = `Invoice for the month of ${(invoiceMonthYear || '').toUpperCase()}`;
  const monthTxtW    = fontBold.widthOfTextAtSize(monthText, 11);
  page.drawText(monthText, {
    x: CL + (CW - monthTxtW) / 2,
    y: monthLabelY,
    size: 11, font: fontBold, color: rgb(0, 0, 0),
  });
  // Underline below month label
  const underlineY = monthLabelY - 4;
  page.drawLine({
    start: { x: CL + (CW - monthTxtW) / 2 - 4, y: underlineY },
    end:   { x: CL + (CW - monthTxtW) / 2 + monthTxtW + 4, y: underlineY },
    thickness: 0.5, color: rgb(0, 0, 0),
  });

  // ── 5. Table layout calculations ────────────────────────────────────────────
  const TABLE_TOP_Y   = monthLabelY - 16;
  const HEADER_ROW_H  = 22;

  // Special rows inside the table (after data rows) — deduction row always shown
  const DEDUCTION_ROW_H = 18;
  const TOTAL_ROW_H     = 18;
  const WORDS_ROW_H     = 24;
  const specialRowsH    = DEDUCTION_ROW_H + TOTAL_ROW_H + WORDS_ROW_H;

  // Space reserved below the table for regards + signature + gap to footer
  const REGARDS_H      = 18 + 3 * 14 + 8;  // gap + 3 lines + bottom gap
  const SIG_H          = 80 + 16;           // image height + footer clearance
  const BELOW_TABLE_H  = REGARDS_H + SIG_H; // ≈ 164

  // Where the table (data + special rows) must end above the footer
  const tableActualBottom = FTR_TOP + BELOW_TABLE_H;          // ≈ 221
  const tableDataBottom   = tableActualBottom + specialRowsH;  // where data rows must end

  const availForRows = Math.max(0, TABLE_TOP_Y - HEADER_ROW_H - tableDataBottom);
  const numRows = (items || []).length;
  const rowH    = numRows > 0 ? clamp(availForRows / numRows, 12, 18) : 18;
  const bodyFS  = rowH < 15 ? 7 : 8;

  // ── 6. Column definitions — 9 fixed columns matching reference layout ────────
  const showIdentifier = hasAnyIdentifier;
  // Fixed widths (all except TRADE): with ProjectNo=355, without ProjectNo=300
  const FIXED_W = showIdentifier ? 355 : 300;
  const tradeW  = Math.max(60, CW - FIXED_W);

  const cols = showIdentifier
    ? [
        { key: 'si',        label: 'SI NO',          width: 25,      align: 'center' },
        { key: 'trade',     label: 'TRADE',          width: tradeW,  align: 'left'   },
        { key: 'id',        label: 'ProjectNo.',     width: 55,      align: 'center' },
        { key: 'unitPrice', label: 'UnitPrice',      width: 48,      align: 'right'  },
        { key: 'hours',     label: 'No.of\nhours',   width: 38,      align: 'right'  },
        { key: 'amount',    label: 'Amount',         width: 55,      align: 'right'  },
        { key: 'vat',       label: 'VAT',            width: 28,      align: 'center' },
        { key: 'vatAmt',    label: 'VATAmount',      width: 52,      align: 'right'  },
        { key: 'netAmt',    label: 'NetAmount',      width: 54,      align: 'right'  },
      ]
    : [
        { key: 'si',        label: 'SI NO',          width: 25,      align: 'center' },
        { key: 'trade',     label: 'TRADE',          width: tradeW,  align: 'left'   },
        { key: 'unitPrice', label: 'UnitPrice',      width: 48,      align: 'right'  },
        { key: 'hours',     label: 'No.of\nhours',   width: 38,      align: 'right'  },
        { key: 'amount',    label: 'Amount',         width: 55,      align: 'right'  },
        { key: 'vat',       label: 'VAT',            width: 28,      align: 'center' },
        { key: 'vatAmt',    label: 'VATAmount',      width: 52,      align: 'right'  },
        { key: 'netAmt',    label: 'NetAmount',      width: 54,      align: 'right'  },
      ];

  if (!hasAnyIdentifier && cols.some((column) => column.key === 'id')) {
    throw new Error('consistency assertion failed: ProjectNo column must be hidden when all identifiers are empty');
  }

  // Keep full table strictly inside the content lane even after left-safe shift.
  const rawTableWidth = cols.reduce((s, c) => s + c.width, 0);
  if (rawTableWidth > CW) {
    const scale = CW / rawTableWidth;
    for (const col of cols) {
      col.width = Math.max(22, Math.round(col.width * scale));
    }

    // Normalize final rounding drift so border aligns exactly at CW.
    const afterScale = cols.reduce((s, c) => s + c.width, 0);
    const drift = CW - afterScale;
    const tradeCol = cols.find((c) => c.key === 'trade') || cols[0];
    tradeCol.width += drift;
  }

  const TOTAL_TABLE_W = cols.reduce((s, c) => s + c.width, 0);
  const TABLE_X       = CL;

  // Columns that carry numeric values in summary rows
  const NUMERIC_KEYS       = ['amount', 'vat', 'vatAmt', 'netAmt'];
  const summaryNumericCols = cols.filter(c => NUMERIC_KEYS.includes(c.key));
  const labelSpanW         = cols.filter(c => !NUMERIC_KEYS.includes(c.key))
                                  .reduce((s, c) => s + c.width, 0);

  // Colours
  const HDR_BG    = rgb(0.05, 0.18, 0.42);   // dark navy for header row
  const HDR_TXT   = rgb(1,    1,    1   );   // white header text
  const BORDER_C  = rgb(0,    0,    0   );
  const BORDER_W  = 0.5;

  // ── 7. Draw table header row ────────────────────────────────────────────────
  page.drawRectangle({
    x: TABLE_X, y: TABLE_TOP_Y - HEADER_ROW_H,
    width: TOTAL_TABLE_W, height: HEADER_ROW_H,
    color: HDR_BG,
  });

  let hcx = TABLE_X;
  for (const col of cols) {
    const hlines = col.label.split('\n');
    const hTextH = hlines.length * 9;
    let hty = TABLE_TOP_Y - (HEADER_ROW_H - hTextH) / 2 - 8;
    for (const hl of hlines) {
      const hlw = fontBold.widthOfTextAtSize(hl, 7.5);
      const hlx = col.align === 'right'
        ? hcx + col.width - hlw - 2
        : col.align === 'center'
          ? hcx + (col.width - hlw) / 2
          : hcx + 3;
      page.drawText(hl, { x: hlx, y: hty, size: 7.5, font: fontBold, color: HDR_TXT });
      hty -= 9;
    }
    // Vertical divider inside header
    if (hcx > TABLE_X) {
      page.drawLine({
        start: { x: hcx, y: TABLE_TOP_Y },
        end:   { x: hcx, y: TABLE_TOP_Y - HEADER_ROW_H },
        thickness: BORDER_W, color: rgb(0.5, 0.5, 0.5),
      });
    }
    hcx += col.width;
  }
  // Header outer border
  page.drawRectangle({
    x: TABLE_X, y: TABLE_TOP_Y - HEADER_ROW_H,
    width: TOTAL_TABLE_W, height: HEADER_ROW_H,
    borderColor: BORDER_C, borderWidth: BORDER_W,
  });

  // ── 8. Draw data rows ────────────────────────────────────────────────────────
  const vatRateDisplay = fmt(Number(vatRate || 0) * 100);
  let rowY = TABLE_TOP_Y - HEADER_ROW_H;

  for (let i = 0; i < (items || []).length; i++) {
    const item   = items[i];
    const qty    = Number(item.quantity || 0);
    const rate   = Number(item.rate     || 0);
    const amt    = Number(item.amount   || 0);
    const vatAmt = amt * Number(vatRate || 0);
    const netAmt = amt + vatAmt;

    const rowData = {
      si:        String(i + 1),
      trade:     String(item.description || ''),
      id:        String(item.identifier  || item.project || ''),
      unitPrice: fmt(rate),
      hours:     fmt(qty),
      amount:    fmt(amt),
      vat:       vatRateDisplay,
      vatAmt:    fmt(vatAmt),
      netAmt:    fmt(netAmt),
    };

    // Row background + border
    page.drawRectangle({
      x: TABLE_X, y: rowY - rowH,
      width: TOTAL_TABLE_W, height: rowH,
      borderColor: BORDER_C, borderWidth: BORDER_W,
    });

    // Cell text + vertical dividers
    let dcx = TABLE_X;
    for (const col of cols) {
      const val = rowData[col.key] || '';
      drawCellText({
        page,
        font: fontRegular,
        text: val,
        x: dcx,
        yTop: rowY,
        width: col.width,
        rowHeight: rowH,
        fontSize: bodyFS,
        align: col.align,
        padding: 3,
        vAlign: 'middle',
      });
      if (dcx > TABLE_X) {
        page.drawLine({
          start: { x: dcx, y: rowY },
          end:   { x: dcx, y: rowY - rowH },
          thickness: BORDER_W, color: BORDER_C,
        });
      }
      dcx += col.width;
    }
    rowY -= rowH;
  }

  // ── Helper: draw a summary row (TOTAL DEDUCTION / TOTAL) ────────────────────
  // highlightLast: if true, fills the last numeric cell with dark navy + white text
  const drawSummaryRow = (label, dataMap, rowHeight, highlightLast = false) => {
    page.drawRectangle({
      x: TABLE_X, y: rowY - rowHeight,
      width: TOTAL_TABLE_W, height: rowHeight,
      borderColor: BORDER_C, borderWidth: BORDER_W,
    });
    const labelTxtY = rowY - rowHeight / 2 - 4;
    page.drawText(label, {
      x: TABLE_X + 4, y: labelTxtY,
      size: 8, font: fontBold, color: rgb(0, 0, 0),
    });
    let nsx = TABLE_X + labelSpanW;
    for (let ci = 0; ci < summaryNumericCols.length; ci++) {
      const col    = summaryNumericCols[ci];
      const isLast = ci === summaryNumericCols.length - 1;
      // Highlight background for last cell of TOTAL row
      if (highlightLast && isLast) {
        page.drawRectangle({
          x: nsx, y: rowY - rowHeight,
          width: col.width, height: rowHeight,
          color: HDR_BG,
        });
      }
      const val  = dataMap[col.key] || '';
      const vw   = fontBold.widthOfTextAtSize(val, 8);
      const vx   = col.align === 'right' ? nsx + col.width - vw - 3 : nsx + 3;
      const vtxt = (highlightLast && isLast) ? HDR_TXT : rgb(0, 0, 0);
      page.drawText(val, { x: vx, y: labelTxtY, size: 8, font: fontBold, color: vtxt });
      page.drawLine({
        start: { x: nsx, y: rowY },
        end:   { x: nsx, y: rowY - rowHeight },
        thickness: BORDER_W, color: BORDER_C,
      });
      nsx += col.width;
    }
    rowY -= rowHeight;
  };

  // ── 9. TOTAL DEDUCTION row — always shown (0.00 when no deduction) ───────────
  drawSummaryRow('TOTAL DEDUCTION', {
    amount: fmt(finalDeduction),
    vat:    vatRateDisplay,
    vatAmt: Number.isFinite(finalDeductionVat) ? finalDeductionVat.toFixed(3) : '0.000',
    netAmt: Number.isFinite(finalDeductionImpact) ? finalDeductionImpact.toFixed(3) : '0.000',
  }, DEDUCTION_ROW_H);

  // ── 10. TOTAL row ────────────────────────────────────────────────────────────
  drawSummaryRow('TOTAL', {
    amount: fmt(finalAdjustedSubtotal),
    vat:    vatRateDisplay,
    vatAmt: Number.isFinite(finalVat) ? finalVat.toFixed(4) : '0.0000',
    netAmt: fmt(finalNet),
  }, TOTAL_ROW_H, true);   // highlight NetAmount cell

  // ── 11. IN WORDS row (full-width span) ───────────────────────────────────────
  const rawInWords = amountToWords(finalNet, 'AED')
    .replace(' AED', ' Dirhams')
    .replace(' only', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  const wordsText = `In words :-  ${rawInWords}`;
  page.drawRectangle({
    x: TABLE_X, y: rowY - WORDS_ROW_H,
    width: TOTAL_TABLE_W, height: WORDS_ROW_H,
    borderColor: BORDER_C, borderWidth: BORDER_W,
  });
  const wrappedWords = wrapText(fontRegular, wordsText, 8, TOTAL_TABLE_W - 8);
  let wtY = rowY - 6 - 8;
  for (const wline of wrappedWords.slice(0, 2)) {
    page.drawText(wline, { x: TABLE_X + 4, y: wtY, size: 8, font: fontRegular, color: rgb(0, 0, 0) });
    wtY -= 10;
  }
  rowY -= WORDS_ROW_H;

  // ── 12. "Thanks and Regards" section ────────────────────────────────────────
  const THANKS_GAP  = 18;
  const THANKS_SIZE = 10;
  const THANKS_LINE = 14;
  const thanksY     = rowY - THANKS_GAP;
  page.drawText('Thanks    and    Regards', {
    x: CL, y: thanksY, size: THANKS_SIZE, font: fontBold, color: rgb(0, 0, 0),
  });
  page.drawText(String(company?.name || ''), {
    x: CL, y: thanksY - THANKS_LINE, size: THANKS_SIZE, font: fontRegular, color: rgb(0, 0, 0),
  });
  if (company?.trn) {
    page.drawText(`TRN No. ${company.trn}`, {
      x: CL, y: thanksY - THANKS_LINE * 2, size: THANKS_SIZE, font: fontBold, color: rgb(0, 0, 0),
    });
  }

  // ── 13. Signature + Stamp images ─────────────────────────────────────────────
  // Keep stamp/signature exactly 4px below the regards block.
  const hasTrnLine = Boolean(company?.trn);
  const regardsLastLineY = hasTrnLine ? (thanksY - THANKS_LINE * 2) : (thanksY - THANKS_LINE);
  const imageTopGap = 4;
  const signAsset = imageBytesIfExists(signaturePath);
  const stampAsset = imageBytesIfExists(stampPath);
  let sigEmbedded = null;
  let stampEmbedded = null;
  let sigFitted = null;
  let stampFitted = null;

  if (signAsset) {
    try {
      sigEmbedded = signAsset.mime.includes('png')
        ? await pdfDoc.embedPng(signAsset.bytes)
        : await pdfDoc.embedJpg(signAsset.bytes);
      sigFitted = fitImageWithin(sigEmbedded, 110, 75);
    } catch {
      sigEmbedded = null;
      sigFitted = null;
    }
  }

  if (stampAsset) {
    try {
      stampEmbedded = stampAsset.mime.includes('png')
        ? await pdfDoc.embedPng(stampAsset.bytes)
        : await pdfDoc.embedJpg(stampAsset.bytes);
      stampFitted = fitImageWithin(stampEmbedded, 75, 75);
    } catch {
      stampEmbedded = null;
      stampFitted = null;
    }
  }

  const tallestImageH = Math.max(sigFitted?.height || 0, stampFitted?.height || 0);
  const imageTopY = regardsLastLineY - imageTopGap;
  const sigBaseY = Math.max(FTR_TOP + 10, imageTopY - tallestImageH);

  if (sigEmbedded && sigFitted) {
    page.drawImage(sigEmbedded, {
      x: CL + 8,
      y: sigBaseY,
      width: sigFitted.width,
      height: sigFitted.height,
    });
  }

  if (stampEmbedded && stampFitted) {
    page.drawImage(stampEmbedded, {
      x: CL + 8 + 120,
      y: sigBaseY,
      width: stampFitted.width,
      height: stampFitted.height,
    });
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  if (!hasAnyIdentifier && cols.some((column) => column.key === 'id')) {
    throw new Error('consistency assertion failed before write: ProjectNo column must be hidden when all identifiers are empty');
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);

  return outputPath;
};

export default {
  renderInvoicePdf,
};
