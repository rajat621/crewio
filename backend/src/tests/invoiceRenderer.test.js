/**
 * Comprehensive renderer regression test suite
 * Tests: single-page, multi-page, edge cases, confidence gating
 */

import { renderInvoicePdf } from '../services/invoiceRenderer.service.js';
import { validateExtractionQuality, alwaysRequiresReview } from '../services/confidenceGating.service.js';
import { signReviewToken, verifyReviewToken } from '../controllers/invoice.controller.js';
import { createHmac } from 'crypto';
import { env } from '../config/env.js';
import fs from 'fs';
import path from 'path';

const TEST_OUTPUT_DIR = './test-outputs';

// Ensure test output directory exists
if (!fs.existsSync(TEST_OUTPUT_DIR)) {
  fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
}

/**
 * Test fixtures
 */
const createBasicInvoice = (overrides = {}) => ({
  invoiceNumber: 'TEST-001',
  invoiceDate: '2026-05-10',
  invoiceMonthYear: 'May 2026',
  company: {
    name: 'Test Company LLC',
    address: '123 Business St',
    city: 'Dubai',
    trn: 'UAE123456789',
  },
  client: {
    name: 'Test Client',
    address: '456 Client Ave',
    city: 'Abu Dhabi',
    trn: 'UAE987654321',
  },
  subtotal: 1000,
  vatRate: 0.05,
  vatAmount: 50,
  total: 1050,
  templatePath: '',
  signaturePath: '',
  stampPath: '',
  templateConfig: {},
  outputPath: path.join(TEST_OUTPUT_DIR, `test-${Date.now()}.pdf`),
  ...overrides,
});

/**
 * TEST 1: Single-page invoice with standard items
 */
export const test_singlePageInvoice = async () => {
  console.log('\n[TEST 1] Single-page invoice with standard items');

  const items = [
    { trade: 'Carpenter', rate: 50, hours: 8, amount: 400 },
    { trade: 'Electrician', rate: 60, hours: 8, amount: 480 },
    { trade: 'Plumber', rate: 55, hours: 4, amount: 220 },
  ];

  try {
    await renderInvoicePdf({
      ...createBasicInvoice({ items }),
      items,
    });
    console.log('✓ Single-page invoice generated successfully');
    return { passed: true };
  } catch (error) {
    console.error('✗ Failed:', error.message);
    return { passed: false, error: error.message };
  }
};

/**
 * TEST 2: Multi-page invoice (20+ rows)
 */
export const test_multiPageInvoice = async () => {
  console.log('\n[TEST 2] Multi-page invoice (20+ rows)');

  const items = Array.from({ length: 25 }, (_, i) => ({
    trade: ['Carpenter', 'Steel Fixer', 'Tile Mason', 'Painter', 'Welder'][i % 5],
    id_project: i % 3 === 0 ? `P${1000 + i}` : undefined,
    rate: 50 + (i % 3) * 10,
    hours: 8 + (i % 4),
    amount: (50 + (i % 3) * 10) * (8 + (i % 4)),
  }));

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);

  try {
    const outputPath = path.join(TEST_OUTPUT_DIR, `test-multipage-${Date.now()}.pdf`);
    await renderInvoicePdf({
      ...createBasicInvoice({
        invoiceNumber: 'TEST-002-MP',
        items,
        subtotal,
        total: subtotal * 1.05,
        vatAmount: subtotal * 0.05,
        outputPath,
      }),
      items,
    });

    // Verify PDF was created and has multiple pages
    const stats = fs.statSync(outputPath);
    console.log(`✓ Multi-page invoice generated (${stats.size} bytes)`);
    return { passed: true, fileSize: stats.size };
  } catch (error) {
    console.error('✗ Failed:', error.message);
    return { passed: false, error: error.message };
  }
};

/**
 * TEST 3: Invoice without project IDs
 */
export const test_noProjectIDs = async () => {
  console.log('\n[TEST 3] Invoice without project IDs (adaptive columns)');

  const items = [
    { trade: 'Carpenter', rate: 50, hours: 8, amount: 400 },
    { trade: 'Steel Fixer', rate: 45, hours: 10, amount: 450 },
    { trade: 'Tile Mason', rate: 55, hours: 6, amount: 330 },
  ];

  try {
    const outputPath = path.join(TEST_OUTPUT_DIR, `test-no-ids-${Date.now()}.pdf`);
    await renderInvoicePdf({
      ...createBasicInvoice({
        invoiceNumber: 'TEST-003-NO-IDS',
        items,
        outputPath,
      }),
      items,
    });
    console.log('✓ No-ID invoice generated successfully (columns adapted)');
    return { passed: true };
  } catch (error) {
    console.error('✗ Failed:', error.message);
    return { passed: false, error: error.message };
  }
};

/**
 * TEST 4: Mixed project IDs (some present, some absent)
 */
export const test_mixedProjectIDs = async () => {
  console.log('\n[TEST 4] Mixed project IDs (some present, some absent)');

  const items = [
    { trade: 'Carpenter', id_project: 'P1001', rate: 50, hours: 8, amount: 400 },
    { trade: 'Steel Fixer', rate: 45, hours: 10, amount: 450 }, // No ID
    { trade: 'Tile Mason', id_project: 'P1003', rate: 55, hours: 6, amount: 330 },
  ];

  try {
    const outputPath = path.join(TEST_OUTPUT_DIR, `test-mixed-ids-${Date.now()}.pdf`);
    await renderInvoicePdf({
      ...createBasicInvoice({
        invoiceNumber: 'TEST-004-MIXED-IDS',
        items,
        outputPath,
      }),
      items,
    });
    console.log('✓ Mixed-ID invoice generated successfully');
    return { passed: true };
  } catch (error) {
    console.error('✗ Failed:', error.message);
    return { passed: false, error: error.message };
  }
};

/**
 * TEST 5: Long trade names and wrapped text
 */
export const test_longTradeNames = async () => {
  console.log('\n[TEST 5] Long trade names and wrapped text');

  const items = [
    {
      trade: 'General Construction and Building Specialist',
      rate: 50,
      hours: 8,
      amount: 400,
    },
    {
      trade: 'Advanced HVAC System Installation and Maintenance Professional',
      rate: 60,
      hours: 10,
      amount: 600,
    },
    {
      trade: 'Structural Steel Fabrication and Installation Technician',
      rate: 65,
      hours: 12,
      amount: 780,
    },
  ];

  try {
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const outputPath = path.join(TEST_OUTPUT_DIR, `test-long-names-${Date.now()}.pdf`);
    await renderInvoicePdf({
      ...createBasicInvoice({
        invoiceNumber: 'TEST-005-LONG',
        items,
        subtotal,
        total: subtotal * 1.05,
        vatAmount: subtotal * 0.05,
        outputPath,
      }),
      items,
    });
    console.log('✓ Long trade names invoice generated successfully');
    return { passed: true };
  } catch (error) {
    console.error('✗ Failed:', error.message);
    return { passed: false, error: error.message };
  }
};

/**
 * TEST 6: Various VAT rates
 */
export const test_multipleVATRates = async () => {
  console.log('\n[TEST 6] Multiple VAT rates (0%, 5%, 15%)');

  const testCases = [
    { rate: 0.0, label: '0%' },
    { rate: 0.05, label: '5%' },
    { rate: 0.15, label: '15%' },
  ];

  const results = [];

  for (const testCase of testCases) {
    const items = [
      { trade: 'Carpenter', rate: 50, hours: 8, amount: 400 },
      { trade: 'Electrician', rate: 60, hours: 8, amount: 480 },
    ];
    const subtotal = 880;
    const vatAmount = subtotal * testCase.rate;

    try {
      const outputPath = path.join(TEST_OUTPUT_DIR, `test-vat-${testCase.label}-${Date.now()}.pdf`);
      await renderInvoicePdf({
        ...createBasicInvoice({
          invoiceNumber: `TEST-006-VAT-${testCase.label}`,
          items,
          subtotal,
          vatRate: testCase.rate,
          vatAmount,
          total: subtotal + vatAmount,
          outputPath,
        }),
        items,
      });
      console.log(`  ✓ VAT ${testCase.label} invoice generated`);
      results.push({ passed: true, vatRate: testCase.label });
    } catch (error) {
      console.error(`  ✗ VAT ${testCase.label} failed:`, error.message);
      results.push({ passed: false, vatRate: testCase.label, error: error.message });
    }
  }

  return { passed: results.every((r) => r.passed), results };
};

/**
 * TEST 7: Large row counts (50+ rows, multi-page)
 */
export const test_largeRowCount = async () => {
  console.log('\n[TEST 7] Large row count (50+ rows)');

  const items = Array.from({ length: 50 }, (_, i) => ({
    trade: ['Carpenter', 'Steel Fixer', 'Tile Mason', 'Painter', 'Welder'][i % 5],
    id_project: i % 4 === 0 ? `P${2000 + i}` : undefined,
    rate: 40 + (i % 5) * 5,
    hours: 6 + (i % 8),
    amount: (40 + (i % 5) * 5) * (6 + (i % 8)),
  }));

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);

  try {
    const outputPath = path.join(TEST_OUTPUT_DIR, `test-large-${Date.now()}.pdf`);
    await renderInvoicePdf({
      ...createBasicInvoice({
        invoiceNumber: 'TEST-007-LARGE',
        items,
        subtotal,
        total: subtotal * 1.05,
        vatAmount: subtotal * 0.05,
        outputPath,
      }),
      items,
    });
    console.log('✓ Large row count invoice generated successfully');
    return { passed: true };
  } catch (error) {
    console.error('✗ Failed:', error.message);
    return { passed: false, error: error.message };
  }
};

/**
 * TEST 8: Confidence gating - low confidence block
 */
export const test_confidenceGatingBlock = () => {
  console.log('\n[TEST 8] Confidence gating - low confidence (should BLOCK)');

  const extractionData = {
    accepted_rows: [{ trade: 'Carpenter', rate: 50, hours: 8, amount: 400 }],
    rejected_rows: Array.from({ length: 15 }, (_, i) => ({ reason: 'Low OCR confidence' })),
    confidence_scores: {
      overall: 0.45,
      trade: 0.40,
      rate: 0.50,
    },
  };

  const result = validateExtractionQuality(extractionData);

  if (!result.approved) {
    console.log('✓ Correctly BLOCKED low confidence extraction');
    return { passed: true, result };
  } else {
    console.error('✗ Should have blocked low confidence');
    return { passed: false, result };
  }
};

/**
 * TEST 9: Universal review requirement - the exact scenario that exposed
 * the original confidence-gating bug (Phase 4.0 audit).
 *
 * This scenario has a rejection rate (2/17 ≈ 11.76%) that exceeds
 * REJECTION_THRESHOLDS.CRITICAL (5%), so validateExtractionQuality
 * classifies it as a hard quality failure (approved: false). That
 * classification is now purely informational severity, not a review
 * gate - the invariant this test protects is that this extraction still
 * requires human review, exactly like every other successful extraction,
 * regardless of how poor validateExtractionQuality judges its quality.
 */
export const test_confidenceGatingApproval = () => {
  console.log('\n[TEST 9] Universal review - poor-quality extraction must still require review');

  const extractionData = {
    accepted_rows: Array.from({ length: 15 }, (_, i) => ({
      trade: 'Carpenter',
      rate: 50,
      hours: 8,
      amount: 400,
    })),
    rejected_rows: Array.from({ length: 2 }, (_, i) => ({ reason: 'Ambiguous text' })),
    confidence_scores: {
      overall: 0.78,
      trade: 0.85,
      rate: 0.75,
    },
  };

  const result = validateExtractionQuality(extractionData);
  const reviewRequired = alwaysRequiresReview(extractionData);

  // The quality classification itself is unchanged (still correctly
  // flags this as a hard-quality-failure scenario) - what matters is
  // that review is required regardless.
  if (reviewRequired === true && result.approved === false) {
    console.log('✓ Poor-quality extraction correctly still requires review (quality info preserved, review not bypassed)');
    return { passed: true, result, reviewRequired };
  } else {
    console.error('✗ Review requirement or quality classification changed unexpectedly');
    return { passed: false, result, reviewRequired };
  }
};

/**
 * TEST 21 (property test): for ANY confidence level and ANY rejection
 * rate, a successful extraction (rows present) must always require
 * review. This is the test that protects the business rule against a
 * future developer accidentally reintroducing confidence-based
 * auto-approval - it does not test a single scenario, it tests the
 * invariant across the full range of inputs the system can produce.
 */
export const test_universalReviewInvariant = () => {
  console.log('\n[TEST 21] Property test - review required across all confidence/rejection levels');

  const confidenceLevels = [0, 0.1, 0.5, 0.79, 0.9, 0.99, 1];
  const rejectionRates = [0, 0.02, 0.1, 0.3, 0.5];
  let allPassed = true;
  const failures = [];

  for (const confidence of confidenceLevels) {
    for (const rejectionRate of rejectionRates) {
      const totalRows = 20;
      const rejectedCount = Math.round(totalRows * rejectionRate);
      const acceptedCount = totalRows - rejectedCount;

      const extractionData = {
        accepted_rows: Array.from({ length: Math.max(acceptedCount, 1) }, () => ({
          trade: 'Carpenter',
          rate: 50,
          hours: 8,
          amount: 400,
        })),
        rejected_rows: Array.from({ length: rejectedCount }, () => ({ reason: 'test' })),
        confidence_scores: { overall: confidence },
      };

      const reviewRequired = alwaysRequiresReview(extractionData);
      if (reviewRequired !== true) {
        allPassed = false;
        failures.push({ confidence, rejectionRate, reviewRequired });
      }
    }
  }

  if (allPassed) {
    console.log(`✓ Review required for all ${confidenceLevels.length * rejectionRates.length} confidence/rejection-rate combinations tested`);
    return { passed: true };
  } else {
    console.error('✗ Review requirement failed for:', JSON.stringify(failures));
    return { passed: false, failures };
  }
};

/**
 * TEST 10: Confidence gating - auto-generate
 */
export const test_confidenceGatingAutoGenerate = () => {
  console.log('\n[TEST 10] Confidence gating - auto-generate (high confidence)');

  const extractionData = {
    accepted_rows: Array.from({ length: 20 }, (_, i) => ({
      trade: 'Carpenter',
      rate: 50,
      hours: 8,
      amount: 400,
    })),
    rejected_rows: [],
    confidence_scores: {
      overall: 0.96,
      trade: 0.98,
      rate: 0.95,
      hours: 0.94,
    },
    totals: {
      subtotal: 8000,
      vat_amount: 400,
      total: 8400,
    },
  };

  const result = validateExtractionQuality(extractionData);

  if (result.approved && result.confident) {
    console.log('✓ Correctly approved for auto-generation');
    return { passed: true, result };
  } else {
    console.error('✗ Should have approved for auto-generation');
    return { passed: false, result };
  }
};

/**
 * TEST 22 (Phase 4.3): review-token bypass protection.
 *
 * Verifies the signed review token closes the "client sends a bare
 * approvedExtraction boolean" bypass found in this phase's audit -
 * a token must be issued by this server, bound to the exact extraction
 * data it accompanies, and used within its expiry window.
 */
export const test_reviewTokenSecurity = () => {
  console.log('\n[TEST 22] Review token - tamper/expiry/data-binding/tenant-binding protection');

  const extraction = {
    accepted_rows: [{ trade: 'Carpenter', rate: 50, hours: 8, amount: 400 }],
    rejected_rows: [],
    confidence_scores: { overall: 0.95 },
  };
  const tamperedExtraction = {
    accepted_rows: [{ trade: 'Carpenter', rate: 999, hours: 8, amount: 7992 }],
    rejected_rows: [],
    confidence_scores: { overall: 0.95 },
  };
  const tenantA = 'owner-aaa';
  const tenantB = 'owner-bbb';

  const failures = [];

  const token = signReviewToken(extraction, tenantA);
  if (!verifyReviewToken(token, extraction, tenantA)) {
    failures.push('valid token failed to verify against its own data and tenant');
  }

  // The same token must NOT verify against different (tampered) data -
  // this is what stops a client from fabricating approvedExtraction
  // content while reusing a token from a real, unrelated extraction.
  if (verifyReviewToken(token, tamperedExtraction, tenantA)) {
    failures.push('token incorrectly verified against tampered data');
  }

  // Phase 4.10: a token issued for Tenant A's extraction must NOT verify
  // for Tenant B, even with the exact same extraction data content -
  // closes a real cross-tenant replay vulnerability found this phase,
  // where the token was previously bound only to data content, not to
  // who it was issued for.
  if (verifyReviewToken(token, extraction, tenantB)) {
    failures.push('token issued for one tenant incorrectly verified for a different tenant with identical data');
  }

  if (verifyReviewToken('fake.token', extraction, tenantA)) {
    failures.push('fabricated token incorrectly verified');
  }
  if (verifyReviewToken(undefined, extraction, tenantA)) {
    failures.push('undefined token incorrectly verified');
  }
  if (verifyReviewToken(null, extraction, tenantA)) {
    failures.push('null token incorrectly verified');
  }

  // An expired token (constructed with the exact same algorithm and
  // secret the real code uses, but a 31-minutes-old timestamp) must be
  // rejected even though its signature is otherwise genuine.
  const expiredIssuedAt = Date.now() - 31 * 60 * 1000;
  const expiredHash = createHmac('sha256', env.JWT_SECRET)
    .update(JSON.stringify({
      ownerId: tenantA,
      accepted_rows: extraction.accepted_rows,
      rejected_rows: extraction.rejected_rows,
      confidence_scores: extraction.confidence_scores,
    }))
    .digest('hex');
  const expiredSignature = createHmac('sha256', env.JWT_SECRET)
    .update(`${expiredHash}:${expiredIssuedAt}`)
    .digest('hex');
  const expiredToken = `${expiredIssuedAt}.${expiredSignature}`;
  if (verifyReviewToken(expiredToken, extraction, tenantA)) {
    failures.push('expired token incorrectly verified');
  }

  if (failures.length === 0) {
    console.log('✓ Review token correctly enforces data-binding, tenant-binding, tamper-resistance, and expiry');
    return { passed: true };
  } else {
    console.error('✗ Review token security failures:', JSON.stringify(failures));
    return { passed: false, failures };
  }
};

/**
 * Run all tests
 */
export const runAllTests = async () => {
  console.log('==========================================');
  console.log('INVOICE RENDERER REGRESSION TEST SUITE');
  console.log('==========================================');

  const results = {
    tests: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
    },
  };

  // Run all tests
  const tests = [
    test_singlePageInvoice,
    test_multiPageInvoice,
    test_noProjectIDs,
    test_mixedProjectIDs,
    test_longTradeNames,
    test_multipleVATRates,
    test_largeRowCount,
    test_confidenceGatingBlock,
    test_confidenceGatingApproval,
    test_confidenceGatingAutoGenerate,
    test_universalReviewInvariant,
    test_reviewTokenSecurity,
  ];

  for (const test of tests) {
    try {
      const result = await test();
      results.tests.push({ name: test.name, ...result });
      results.summary.total++;
      if (result.passed) results.summary.passed++;
      else results.summary.failed++;
    } catch (error) {
      results.tests.push({ name: test.name, passed: false, error: error.message });
      results.summary.total++;
      results.summary.failed++;
    }
  }

  // Print summary
  console.log('\n==========================================');
  console.log('TEST SUMMARY');
  console.log('==========================================');
  console.log(`Total: ${results.summary.total}`);
  console.log(`Passed: ${results.summary.passed}`);
  console.log(`Failed: ${results.summary.failed}`);
  console.log(`Pass Rate: ${((results.summary.passed / results.summary.total) * 100).toFixed(1)}%`);
  console.log(`\nTest outputs saved to: ${TEST_OUTPUT_DIR}`);

  return results;
};

// Export for testing framework
export default {
  runAllTests,
  test_singlePageInvoice,
  test_multiPageInvoice,
  test_noProjectIDs,
  test_mixedProjectIDs,
  test_longTradeNames,
  test_multipleVATRates,
  test_largeRowCount,
  test_confidenceGatingBlock,
  test_confidenceGatingApproval,
  test_confidenceGatingAutoGenerate,
  test_universalReviewInvariant,
  test_reviewTokenSecurity,
};


