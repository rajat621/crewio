import api from './client'

export const salarySlipsApi = {
  listSalarySlips: (employeeId) =>
    api.get('/api/salary-slips', {
      params: employeeId ? { employeeId } : undefined,
    }),

  createSalarySlip: (data) =>
    api.post('/api/salary-slips', data),
}

function generateSalarySlipPdf(data) {
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
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
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(bold ? SLIP_DARK : SLIP_BODY);
    doc.text(label, marginX, yy);
    doc.text(value, rightX, yy, { align: "right" });
  };

  const drawSection = (heading, subheading, rows, total) => {
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(SLIP_DARK);
    doc.text(heading, marginX, y);
    if (subheading) {
      const headingWidth = doc.getTextWidth(heading);
      doc.setFont("helvetica", "italic");
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
  doc.setFillColor(SLIP_AVATAR_BG);
  doc.circle(marginX + 8, y + 4, 8, "F");
  doc.setFillColor(SLIP_AVATAR_FG);
  doc.circle(marginX + 8, y + 1.5, 2.6, "F");
  doc.ellipse(marginX + 8, y + 8, 4.6, 2.8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(SLIP_DARK);
  doc.text(data.companyName, marginX + 21, y + 1);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(SLIP_MUTED);
  doc.text(data.companyPhone, marginX + 21, y + 7);

  doc.text("Pay Slip for", marginX + 21, y + 13);
  const payForWidth = doc.getTextWidth("Pay Slip for ");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(SLIP_DARK);
  doc.text(`${data.payMonth} ${data.payYear}`, marginX + 21 + payForWidth, y + 13);

  y += 17;
  drawDivider(y);
  y += 6;

  // Employee details
  const empRows = [
    ["Employee Name :", data.employee.name],
    ["Emirates ID :", data.employee.emiratesId],
    ["Trade :", data.employee.trade],
    ["Total Day Worked :", `${data.employee.totalDaysWorked} Days`],
    ["Total Hour Worked :", `${data.employee.totalHoursWorked} hr`],
  ];
  doc.setFontSize(10);
  empRows.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(SLIP_MUTED);
    doc.text(label, marginX, y);
    doc.setTextColor(SLIP_DARK);
    doc.text(String(value), marginX + 38, y);
    y += 5.4;
  });
  y += 0.4;
  drawDivider(y);

  drawSection(
    "Your Earnings",
    "(This Month)",
    [
      { label: "Calculated Salary (Rate x Hours)", value: `AED ${data.earnings.calculatedSalary.toFixed(2)}` },
      { label: "Additional Allowances", value: `AED ${data.earnings.additionalAllowances.toFixed(2)}` },
    ],
    { label: "Gross Salary", value: `AED ${data.earnings.grossSalary.toFixed(2)}` }
  );

  drawSection(
    "Deductions Amount",
    null,
    data.deductionRows.map((row) => ({ label: row.label, value: `AED ${row.value.toFixed(2)}` })),
    { label: "Total Deduction", value: `AED ${data.totalDeduction.toFixed(2)}` }
  );

  drawSection(
    "Advance Summary",
    null,
    [
      { label: "Total Advance Given", value: `AED ${data.advance.totalGiven.toFixed(2)}` },
      { label: "This Month Deduction", value: `AED ${data.advance.thisMonthDeduction.toFixed(2)}` },
    ],
    { label: "Remaining Advance", value: `AED ${data.advance.remaining.toFixed(2)}` }
  );

  // Net Salary footer band — fills to the bottom of the A5 page.
  const pageHeight = 210;
  const footerHeight = 20;
  doc.setFillColor(SLIP_FOOTER_BG);
  doc.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(SLIP_DARK);
  doc.text("Net Salary", marginX, pageHeight - 8);
  const netLabelWidth = doc.getTextWidth("Net Salary ");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(11);
  doc.text("(In Hand )", marginX + netLabelWidth, pageHeight - 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`AED ${data.netSalary.toFixed(2)}`, rightX, pageHeight - 8, { align: "right" });

  return doc;
}