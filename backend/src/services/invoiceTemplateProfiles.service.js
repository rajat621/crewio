const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const deepMerge = (base, override) => {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
};

const getDefaultProfile = ({ pageWidth, pageHeight }) => {
  const contentLeft = clamp(Math.round(pageWidth * 0.06), 20, pageWidth - 120);
  const contentRight = clamp(pageWidth - Math.round(pageWidth * 0.06), contentLeft + 100, pageWidth - 20);
  const contentWidth = contentRight - contentLeft;

  const footerBoundaryY = Math.round(pageHeight * 0.11);
  const tableTopY = Math.round(pageHeight * 0.62);
  const tableBottomY = footerBoundaryY + 150;

  return {
    templateId: 'branded-enterprise-v1',
    safeZones: {
      contentLeft,
      contentRight,
      contentStartY: pageHeight - 90,
      contentEndY: footerBoundaryY,
      contentTop: pageHeight - 90,
      contentBottom: footerBoundaryY,
      tableLeft: contentLeft,
      tableRight: contentRight,
      tableTopY,
      tableBottomY,
      footerBoundaryY,
    },
    coordinates: {
      title: { x: Math.round(contentLeft + contentWidth / 2), y: pageHeight - 120, size: 16 },
      invoiceNumber: { x: contentLeft, y: pageHeight - 148, size: 10 },
      date: { x: contentRight - 170, y: pageHeight - 148, size: 10 },
      clientBlock: { x: contentLeft, y: pageHeight - 175, lineGap: 14, size: 10 },
      invoiceMonth: { x: Math.round(contentLeft + contentWidth / 2), y: tableTopY + 26, size: 11 },
      dynamicTable: {
        x: contentLeft,
        topY: tableTopY,
        rightX: contentRight,
        headerHeight: 22,
        rowMinHeight: 18,
        rowPadding: 4,
      },
      totals: {
        x: contentRight - 220,
        y: tableBottomY + 32,
        width: 220,
        lineGap: 20,
        size: 10,
      },
      amountInWords: { x: contentLeft, y: tableBottomY + 4, size: 9 },
      regards: { x: contentLeft, y: tableBottomY - 20, lineGap: 16, size: 10 },
      signature: { x: contentLeft + 8, y: footerBoundaryY + 10, width: 150, height: 90 },
      stamp: { x: contentLeft + 8 + 150 + 24, y: footerBoundaryY + 10, width: 90, height: 90 },
      footer: { pageLabelY: 20, footerNoteY: 20 },
    },
    columnLayout: {
      includeIdentifier: {
        columns: [
          { key: 'description', label: 'TRADE', min: 185, max: 340, weight: 1.65, align: 'left', type: 'text' },
          { key: 'project', label: 'ID / PROJECT', min: 90, max: 190, weight: 1.2, align: 'center', type: 'text' },
          { key: 'rate', label: 'RATE', width: 86, align: 'right', type: 'numeric' },
          { key: 'quantity', label: 'HOURS', width: 72, align: 'right', type: 'numeric' },
          { key: 'amount', label: 'AMOUNT', width: 100, align: 'right', type: 'numeric' },
        ],
      },
      withoutIdentifier: {
        columns: [
          { key: 'description', label: 'TRADE', min: 220, max: 430, weight: 1.8, align: 'left', type: 'text' },
          { key: 'rate', label: 'RATE', width: 86, align: 'right', type: 'numeric' },
          { key: 'quantity', label: 'HOURS', width: 72, align: 'right', type: 'numeric' },
          { key: 'amount', label: 'AMOUNT', width: 100, align: 'right', type: 'numeric' },
        ],
      },
      cell: {
        headerFontSize: 8,
        bodyFontMin: 7,
        bodyFontMax: 9,
        lineHeightFactor: 1.25,
        rowPadding: 4,
      },
    },
    footerRules: {
      preserveBottomGap: 10,
      renderPageLabel: true,
      renderFooterNotes: true,
      renderSignature: true,
      renderStamp: true,
    },
    paginationRules: {
      repeatTableHeader: true,
      firstPageTableTopY: tableTopY,
      nextPageTableTopY: tableTopY,
      tableBottomY,
      minTotalsBlockHeight: 86,
    },
    renderRules: {
      renderTitle: true,
      renderClientBlock: true,
      renderMonthLabel: true,
      renderTableHeader: true,
      renderTableGrid: true,
      renderTotalsLabels: true,
    },
  };
};

const mapLegacyConfig = (config = {}, profile, pageWidth, pageHeight) => {
  const merged = JSON.parse(JSON.stringify(profile));

  if (typeof config.safeContentLeft === 'number') {
    merged.safeZones.contentLeft = config.safeContentLeft;
  }
  if (typeof config.safeContentRight === 'number') {
    merged.safeZones.contentRight = pageWidth - config.safeContentRight;
  }

  if (typeof config.footerBoundaryY === 'number') {
    merged.safeZones.footerBoundaryY = config.footerBoundaryY;
    merged.safeZones.contentBottom = config.footerBoundaryY;
    merged.safeZones.contentEndY = config.footerBoundaryY;
    merged.safeZones.tableBottomY = Math.max(config.footerBoundaryY + 120, merged.safeZones.tableBottomY);
    merged.paginationRules.tableBottomY = merged.safeZones.tableBottomY;
  }

  if (typeof config.tableStartY === 'number') {
    const legacyTopY = pageHeight - config.tableStartY;
    merged.safeZones.tableTopY = legacyTopY;
    merged.coordinates.dynamicTable.topY = legacyTopY;
    merged.paginationRules.firstPageTableTopY = legacyTopY;
    merged.paginationRules.nextPageTableTopY = legacyTopY;
  }

  if (typeof config.headerBoundaryY === 'number') {
    const headerTop = pageHeight - config.headerBoundaryY;
    merged.coordinates.title.y = headerTop + 48;
    merged.coordinates.invoiceNumber.y = headerTop + 24;
    merged.coordinates.date.y = headerTop + 24;
    merged.coordinates.clientBlock.y = headerTop - 4;
  }

  if (typeof config.signatureAreaX === 'number') merged.coordinates.signature.x = config.signatureAreaX;
  if (typeof config.signatureAreaY === 'number') merged.coordinates.signature.y = config.signatureAreaY;
  if (typeof config.signatureAreaWidth === 'number') merged.coordinates.signature.width = config.signatureAreaWidth;
  if (typeof config.signatureAreaHeight === 'number') merged.coordinates.signature.height = config.signatureAreaHeight;

  return merged;
};

export const resolveTemplateProfile = ({ templateConfig = {}, pageWidth, pageHeight }) => {
  const base = getDefaultProfile({ pageWidth, pageHeight });
  const requestedId = templateConfig.templateId || templateConfig.profile?.templateId || base.templateId;

  const preset =
    requestedId === 'branded-enterprise-compact'
      ? {
          templateId: 'branded-enterprise-compact',
          coordinates: {
            dynamicTable: { headerHeight: 20, rowMinHeight: 17 },
            totals: { width: 210, lineGap: 18, size: 9 },
          },
          columnLayout: {
            cell: { bodyFontMin: 6.8, bodyFontMax: 8.6, lineHeightFactor: 1.22, rowPadding: 3.5 },
          },
          paginationRules: { minTotalsBlockHeight: 74 },
        }
      : { templateId: 'branded-enterprise-v1' };

  const withPreset = deepMerge(base, preset);
  const withLegacy = mapLegacyConfig(templateConfig, withPreset, pageWidth, pageHeight);

  let merged = deepMerge(withLegacy, templateConfig.profile || {});

  if (templateConfig.templateId) {
    merged.templateId = templateConfig.templateId;
  }

  if (templateConfig.safeZones) {
    merged.safeZones = deepMerge(merged.safeZones, templateConfig.safeZones);
  }
  if (templateConfig.coordinates) {
    merged.coordinates = deepMerge(merged.coordinates, templateConfig.coordinates);
  }
  if (templateConfig.columnLayout) {
    merged.columnLayout = deepMerge(merged.columnLayout, templateConfig.columnLayout);
  }
  if (templateConfig.footerRules) {
    merged.footerRules = deepMerge(merged.footerRules, templateConfig.footerRules);
  }
  if (templateConfig.paginationRules) {
    merged.paginationRules = deepMerge(merged.paginationRules, templateConfig.paginationRules);
  }
  if (templateConfig.renderRules) {
    merged.renderRules = deepMerge(merged.renderRules, templateConfig.renderRules);
  }

  const left = clamp(Number(merged.safeZones.contentLeft || 40), 15, pageWidth - 120);
  const right = clamp(Number(merged.safeZones.contentRight || (pageWidth - 40)), left + 120, pageWidth - 15);
  merged.safeZones.contentLeft = left;
  merged.safeZones.contentRight = right;

  const tableLeft = clamp(Number(merged.safeZones.tableLeft ?? left), left, right - 120);
  const tableRight = clamp(Number(merged.safeZones.tableRight ?? right), tableLeft + 120, right);
  merged.safeZones.tableLeft = tableLeft;
  merged.safeZones.tableRight = tableRight;

  const footerBoundaryY = clamp(Number(merged.safeZones.footerBoundaryY || 80), 20, pageHeight / 3);
  merged.safeZones.footerBoundaryY = footerBoundaryY;
  merged.safeZones.contentBottom = footerBoundaryY;
  merged.safeZones.contentEndY = footerBoundaryY;

  const tableTopY = clamp(Number(merged.safeZones.tableTopY || (pageHeight - 290)), footerBoundaryY + 150, pageHeight - 120);
  merged.safeZones.tableTopY = tableTopY;

  const contentStartY = clamp(Number(merged.safeZones.contentStartY || merged.safeZones.contentTop || (pageHeight - 90)), tableTopY + 10, pageHeight - 30);
  merged.safeZones.contentStartY = contentStartY;
  merged.safeZones.contentTop = contentStartY;

  const tableBottomY = clamp(Number(merged.safeZones.tableBottomY || (footerBoundaryY + 150)), footerBoundaryY + 80, tableTopY - 80);
  merged.safeZones.tableBottomY = tableBottomY;

  merged.coordinates.dynamicTable.x = tableLeft;
  merged.coordinates.dynamicTable.rightX = tableRight;
  merged.coordinates.dynamicTable.topY = tableTopY;

  merged.paginationRules.firstPageTableTopY = clamp(
    Number(merged.paginationRules.firstPageTableTopY || tableTopY),
    tableBottomY + 60,
    tableTopY
  );
  merged.paginationRules.nextPageTableTopY = clamp(
    Number(merged.paginationRules.nextPageTableTopY || tableTopY),
    tableBottomY + 60,
    tableTopY
  );
  merged.paginationRules.tableBottomY = tableBottomY;

  merged.coordinates.stamp.width = Number(merged.coordinates.stamp.width || 90);
  merged.coordinates.stamp.height = Number(merged.coordinates.stamp.height || 90);

  return merged;
};

export default {
  resolveTemplateProfile,
};


