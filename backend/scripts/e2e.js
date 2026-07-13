import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:5002/api';
const OWNER_EMAIL = 'owner@example.com';
const OWNER_PASSWORD = 'Password123!';

const results = [];

const push = (name, pass, info) => {
  results.push({ name, pass, info });
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`, info || '');
};

const authLogin = async () => {
  const res = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }) });
  const json = await res.json();
  return { res, json };
};

const run = async () => {
  try {
    // Auth
    const { res: loginRes, json: loginJson } = await authLogin();
    if (loginRes.status === 200 && loginJson?.token) {
      push('Auth Login', true);
    } else {
      push('Auth Login', false, JSON.stringify(loginJson));
      return;
    }

    const token = loginJson.token;
    const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };

    // Get companies
    const compRes = await fetch(`${BASE}/companies`, { headers });
    const compJson = await compRes.json();
    if (compRes.ok && Array.isArray(compJson.data)) push('Get Companies', true); else push('Get Companies', false, JSON.stringify(compJson));

    const company = compJson.data && compJson.data[0];

    // Employees list
    const empRes = await fetch(`${BASE}/employees`, { headers });
    const empJson = await empRes.json();
    if (empRes.ok && Array.isArray(empJson.data)) push('Get Employees', true); else push('Get Employees', false, JSON.stringify(empJson));

    const employee = empJson.data && empJson.data[0];

    // Attendance list
    const attRes = await fetch(`${BASE}/attendance`, { headers });
    const attJson = await attRes.json();
    if (attRes.ok) push('List Attendance', true); else push('List Attendance', false, JSON.stringify(attJson));

    // Invoice list
    const invRes = await fetch(`${BASE}/invoices`, { headers });
    const invJson = await invRes.json();
    if (invRes.ok) push('List Invoices', true); else push('List Invoices', false, JSON.stringify(invJson));

    // File retrieval (use first invoice's generated_invoice_pdf or file record)
    let filePath = null;
    if (invJson?.data && invJson.data.length > 0) {
      filePath = invJson.data[0].generated_invoice_pdf || invJson.data[0].pdfUrl;
    }
    if (!filePath) {
      // fallback to known seed path
      filePath = '/uploads/timesheets/seed-timesheet.pdf';
    }

    // Find file record by path via invoices controller's filerecord lookup endpoint doesn't exist; instead attempt to download invoice if invoice id exists
    if (invJson?.data && invJson.data.length > 0) {
      const id = invJson.data[0]._id;
      const dl = await fetch(`${BASE}/invoices/${id}/download`, { headers });
      if (dl.status === 200) push('Download Invoice PDF', true); else push('Download Invoice PDF', false, `status:${dl.status}`);
    } else {
      push('Download Invoice PDF', false, 'No invoice available');
    }

    // AI capabilities (public)
    const cap = await fetch(`${BASE}/ai/capabilities`);
    if (cap.ok) push('AI Capabilities (public)', true); else push('AI Capabilities (public)', false);

    // Mobile tests: employee login using seeded employee credentials
    // We know seed employees have appUserId EMP001.. and password Emp1Pass!, Emp2Pass!, Emp3Pass!
    const mobileLogin = await fetch(`${BASE}/mobile/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appUserId: 'EMP001', password: 'Emp1Pass!', ownerId: company ? company.ownerId : undefined }) });
    const mobileJson = await mobileLogin.json();
    if (mobileLogin.ok && mobileJson.token) {
      push('Mobile Login', true);
      const mtoken = mobileJson.token;
      const mheaders = { Authorization: `Bearer ${mtoken}` };
      const profile = await fetch(`${BASE}/mobile/profile`, { headers: mheaders });
      if (profile.ok) push('Mobile Profile', true); else push('Mobile Profile', false, `status:${profile.status}`);

      const checkIn = await fetch(`${BASE}/mobile/attendance/check-in`, { method: 'POST', headers: mheaders });
      if (checkIn.ok) push('Mobile Check-in', true); else push('Mobile Check-in', false, `status:${checkIn.status}`);

      const checkOut = await fetch(`${BASE}/mobile/attendance/check-out`, { method: 'POST', headers: mheaders });
      if (checkOut.ok) push('Mobile Check-out', true); else push('Mobile Check-out', false, `status:${checkOut.status}`);
    } else {
      push('Mobile Login', false, JSON.stringify(mobileJson));
    }

    // Files: attempt to GET seed file via FileRecord id. There's a files listing API? Use /files/:id only. Find a file record by seeded path via legacy File model isn't exposed; instead try to list files via invoices file lookup above.

    // Final report
    const pass = results.filter((r) => r.pass).length;
    const fail = results.length - pass;
    console.log('\nE2E Summary: Total:', results.length, 'Pass:', pass, 'Fail:', fail);
    for (const r of results) console.log(r.name, r.pass ? 'PASS' : 'FAIL', r.info || '');
    process.exit(fail > 0 ? 2 : 0);
  } catch (err) {
    console.error('E2E runner error', err);
    process.exit(1);
  }
};

run();
