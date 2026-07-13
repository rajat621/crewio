#!/usr/bin/env node

/**
 * Final Production Validation Script
 * Runs comprehensive test suite and generates final proof invoices
 */

import { runAllTests } from './tests/invoiceRenderer.test.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORT_DIR = path.join(__dirname, '..', 'validation-reports');

// Ensure report directory exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

/**
 * Generate validation report
 */
const generateReport = async () => {
  const timestamp = new Date().toISOString();
  console.log(`\nðŸ“‹ Generating production validation report at ${timestamp}`);

  const testResults = await runAllTests();

  const report = {
    timestamp,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
    },
    tests: testResults,
    recommendations: [],
  };

  // Generate recommendations based on results
  if (testResults.summary.failed === 0) {
    report.recommendations.push('âœ“ All tests passed - system is ready for production');
    report.recommendations.push('âœ“ Confidence gating working correctly');
    report.recommendations.push('âœ“ Multi-page pagination verified');
  } else {
    report.recommendations.push('âš  Review failed tests before production deployment');
    report.recommendations.push('âš  Run suite again after fixes');
  }

  // Save report
  const reportPath = path.join(REPORT_DIR, `validation-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\nðŸ“„ Validation report saved to: ${reportPath}`);

  return report;
};

// Run validation
console.log('\nðŸš€ Starting Production Quality Validation Suite\n');
generateReport().then((report) => {
  console.log('\nâœ… Validation complete');
  console.log(`Final Status: ${report.tests.summary.failed === 0 ? 'âœ“ PASSED' : 'âœ— FAILED'}`);
});


