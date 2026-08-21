// backend/src/config/legalDocuments.js
//
// Single source of truth for every legal document CrewControl shows users
// (signup consent, Account & Security > Legal & Privacy). Content lives here
// as structured data (not markdown/html files) so both the "accept on
// signup" flow and the "view in Account & Security" flow render identical,
// versioned content from one place.
//
// LEGAL_BUNDLE_VERSION is a single version for the *set* of documents the
// user consents to as one action ("I agree to the Privacy Policy, T&Cs,
// ..."). Bump it (and EFFECTIVE_DATE/LAST_UPDATED) whenever the substance of
// any document below changes - every user will then be required to
// re-review and re-accept on next login (see legal.controller.js).
//
// Fill in the placeholders (marked {{LIKE_THIS}}) with real business/legal
// details before shipping to production.

export const LEGAL_BUNDLE_VERSION = '1.0.0';
export const LEGAL_EFFECTIVE_DATE = '2026-07-19';
export const LEGAL_LAST_UPDATED = '2026-07-19';

const PLACEHOLDERS = {
  COMPANY_NAME: '{{COMPANY_LEGAL_NAME}}',
  BRAND_NAME: 'CrewControl',
  REGISTERED_ADDRESS: '{{REGISTERED_BUSINESS_ADDRESS}}',
  JURISDICTION: '{{GOVERNING_JURISDICTION, e.g. Dubai, United Arab Emirates}}',
  LEGAL_EMAIL: '{{LEGAL_CONTACT_EMAIL}}',
  PRIVACY_EMAIL: '{{PRIVACY_CONTACT_EMAIL}}',
  DPO_EMAIL: '{{DATA_PROTECTION_OFFICER_EMAIL}}',
  SUPPORT_EMAIL: '{{SUPPORT_EMAIL}}',
};

// Reusable section shape: { heading, body: [ { type: 'p'|'ul', text|items } ] }
const p = (text) => ({ type: 'p', text });
const ul = (items) => ({ type: 'ul', items });

const meta = (overrides = {}) => ({
  version: LEGAL_BUNDLE_VERSION,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  lastUpdated: LEGAL_LAST_UPDATED,
  ...overrides,
});

export const LEGAL_DOCUMENTS = {
  'privacy-policy': {
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    ...meta(),
    sections: [
      {
        heading: '1. Introduction',
        body: [
          p(`This Privacy Policy explains how ${PLACEHOLDERS.COMPANY_NAME} ("${PLACEHOLDERS.BRAND_NAME}", "we", "us", "our") collects, uses, stores, shares, and protects information when you use our workforce management and AI-driven invoicing platform (the "Service"), whether via our web dashboard or companion mobile application.`),
          p(`We are committed to processing personal data lawfully, fairly, and transparently, in line with the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021, "PDPL"), the EU General Data Protection Regulation ("GDPR") where applicable, and internationally recognized SaaS data-protection practices.`),
        ],
      },
      {
        heading: '2. Information We Collect',
        body: [
          p('We collect the following categories of information:'),
          ul([
            'Account information: name, email address, password (hashed), mobile number, role, and company affiliation.',
            'Company information: legal name, tax registration number, registered address, contact details, and branding assets (logo, stamp, authorized signature).',
            'Employee records: names, contact details, trades/roles, employment dates, and employment documents you upload.',
            'Attendance and time data: check-in/check-out timestamps, work sessions, leave records.',
            'Location (GPS) data: device location captured during active shifts to verify on-site attendance, where enabled.',
            'Timesheets and uploaded documents: PDF timesheets, invoices, and related files you upload for processing.',
            'AI-extracted invoice data: structured data (line items, amounts, dates, vendor details) produced by our AI/OCR pipeline from uploaded documents.',
            'Generated invoices and payroll information: invoices, salary slips, deductions, and payment-related records you create in the Service.',
            'Chat messages: messages exchanged between office/admin users and employees within the Service.',
            'Notifications: in-app and push notification content and delivery metadata.',
            'Analytics and usage data: feature usage, session activity, device/browser type, and IP address.',
            'Audit logs: records of security-relevant actions (logins, permission changes, data exports, legal-agreement acceptances) kept for compliance purposes.',
          ]),
        ],
      },
      {
        heading: '3. Purpose of Processing',
        body: [
          p('We process personal data to:'),
          ul([
            'Provide, operate, and maintain the Service, including attendance tracking, invoicing, and payroll features.',
            'Verify identity and authenticate accounts.',
            'Process uploaded documents using AI/OCR to extract structured invoice and timesheet data.',
            'Generate invoices, salary slips, and expense reports on your behalf.',
            'Send transactional notifications (e.g. new chat messages, attendance alerts) and, where you opt in, product updates.',
            'Monitor, secure, and improve the Service, including fraud prevention and abuse detection.',
            'Comply with legal, tax, and regulatory obligations.',
          ]),
        ],
      },
      {
        heading: '4. Storage and Encryption',
        body: [
          p('Data is stored on infrastructure operated by our hosting and database providers, with access restricted to authorized personnel and systems. Data in transit is encrypted using TLS. Sensitive fields (such as password credentials) are stored using one-way cryptographic hashing and are never stored or transmitted in plaintext. Uploaded files and generated documents are stored in access-controlled object storage.'),
        ],
      },
      {
        heading: '5. AI Processing',
        body: [
          p('Uploaded timesheets and invoice documents may be processed by our AI/OCR pipeline (which may include third-party AI or OCR providers acting as sub-processors) to extract structured data automatically. This processing is performed to deliver the core invoicing functionality of the Service. We do not use your uploaded business documents to train AI models for use outside your account.'),
        ],
      },
      {
        heading: '6. Cookies and Analytics',
        body: [
          p('We use essential, authentication, session, and (where enabled) analytics cookies. See our Cookie Policy for full details on the categories of cookies used and how to manage your preferences.'),
        ],
      },
      {
        heading: '7. Location Tracking',
        body: [
          p('Where the mobile companion app is used for attendance, we collect device GPS location at check-in/check-out and, where configured by the employer, during active shifts, solely to verify on-site presence. Location tracking can be controlled at the device level via mobile OS permissions.'),
        ],
      },
      {
        heading: '8. Your Rights',
        body: [
          p('Subject to applicable law (including UAE PDPL and, where applicable, GDPR), you may have the right to:'),
          ul([
            'Access the personal data we hold about you.',
            'Request correction of inaccurate or incomplete data.',
            'Request deletion of your personal data ("right to erasure"), subject to legal retention obligations.',
            'Request a portable copy of your data in a structured, machine-readable format.',
            'Object to or restrict certain processing activities.',
            'Withdraw consent where processing is based on consent, without affecting processing carried out before withdrawal.',
          ]),
          p(`To exercise these rights, contact us at ${PLACEHOLDERS.PRIVACY_EMAIL}.`),
        ],
      },
      {
        heading: '9. Data Deletion and Portability',
        body: [
          p('You may request deletion of your account and associated personal data at any time, subject to retention periods described in our Data Retention Policy (e.g. for tax, audit, and dispute-resolution purposes). Where technically feasible, we will provide your data in a portable format (such as CSV or JSON) upon request.'),
        ],
      },
      {
        heading: '10. International Transfers',
        body: [
          p(`Where personal data is transferred outside the ${PLACEHOLDERS.JURISDICTION} (for example, to cloud infrastructure or sub-processors located elsewhere), we take reasonable steps to ensure such transfers are subject to appropriate safeguards, such as standard contractual clauses or equivalent mechanisms recognized under UAE PDPL and GDPR.`),
        ],
      },
      {
        heading: '11. Third-Party Processors',
        body: [
          p('We engage vetted third-party service providers (sub-processors) to host infrastructure, send transactional email/SMS/push notifications, process payments, and perform AI/OCR extraction. Each sub-processor is bound by contractual confidentiality and data-protection obligations consistent with this Policy. A current list of sub-processor categories is available on request.'),
        ],
      },
      {
        heading: '12. Contact Us',
        body: [
          p(`Questions about this Privacy Policy or our data practices can be directed to ${PLACEHOLDERS.PRIVACY_EMAIL} or our Data Protection contact at ${PLACEHOLDERS.DPO_EMAIL}.`),
        ],
      },
    ],
  },

  'terms-and-conditions': {
    slug: 'terms-and-conditions',
    title: 'Terms & Conditions',
    ...meta(),
    sections: [
      {
        heading: '1. Account Ownership',
        body: [
          p(`The individual who registers for the Service is the "Account Owner" and is responsible for all activity under that account, including activity by employees or team members granted access. You must provide accurate registration information and keep it up to date.`),
        ],
      },
      {
        heading: '2. Subscription and Billing',
        body: [
          p('Access to paid features requires an active subscription. Subscription fees are billed in advance on a recurring basis (monthly or yearly, as selected) via our payment processor. Prices may change with reasonable prior notice.'),
        ],
      },
      {
        heading: '3. Cancellation and Refunds',
        body: [
          p('You may cancel your subscription at any time; access continues until the end of the current billing period. Except where required by applicable law, fees already paid are non-refundable. Cancellation does not entitle you to a pro-rated refund for unused time unless otherwise stated at the time of purchase.'),
        ],
      },
      {
        heading: '4. Responsibilities',
        body: [
          p('You are responsible for the accuracy of data entered into the Service (including attendance, invoice, and payroll data) and for maintaining the confidentiality of your login credentials.'),
        ],
      },
      {
        heading: '5. Service Availability',
        body: [
          p('We aim to keep the Service available at all times but do not guarantee uninterrupted access. Scheduled maintenance, third-party outages, or force majeure events may result in temporary unavailability.'),
        ],
      },
      {
        heading: '6. Intellectual Property',
        body: [
          p(`All rights, title, and interest in the Service, including software, design, and branding, remain the exclusive property of ${PLACEHOLDERS.COMPANY_NAME} and its licensors. You retain ownership of the business data you upload or generate through the Service.`),
        ],
      },
      {
        heading: '7. Limitation of Liability',
        body: [
          p(`To the maximum extent permitted by law, ${PLACEHOLDERS.COMPANY_NAME} shall not be liable for indirect, incidental, special, or consequential damages arising from use of the Service, including reliance on AI-extracted data, which should be reviewed for accuracy before use in official filings.`),
        ],
      },
      {
        heading: '8. Indemnification',
        body: [
          p(`You agree to indemnify and hold harmless ${PLACEHOLDERS.COMPANY_NAME} from claims arising out of your misuse of the Service or violation of these Terms.`),
        ],
      },
      {
        heading: '9. Force Majeure',
        body: [
          p('Neither party is liable for delays or failures caused by events beyond reasonable control, including natural disasters, internet or infrastructure outages, or governmental action.'),
        ],
      },
      {
        heading: '10. Governing Law and Dispute Resolution',
        body: [
          p(`These Terms are governed by the laws of ${PLACEHOLDERS.JURISDICTION}. Any dispute arising from these Terms will first be addressed through good-faith negotiation, and if unresolved, submitted to the competent courts or arbitration body of ${PLACEHOLDERS.JURISDICTION}.`),
        ],
      },
      {
        heading: '11. Suspension and Termination',
        body: [
          p('We may suspend or terminate accounts that violate these Terms, our Terms of Use, or applicable law, or that pose a security risk to the Service or other users. Where reasonably possible, we will provide notice before suspension.'),
        ],
      },
    ],
  },

  'terms-of-use': {
    slug: 'terms-of-use',
    title: 'Terms of Use',
    ...meta(),
    sections: [
      {
        heading: '1. Acceptable Use',
        body: [
          p('The Service is provided for legitimate workforce management and invoicing purposes. You agree to use it only as intended and in compliance with applicable law.'),
        ],
      },
      {
        heading: '2. Prohibited Activities',
        body: [
          p('You must not:'),
          ul([
            'Share your login credentials with unauthorized individuals or allow account access outside your organization.',
            'Attempt to gain unauthorized access to any part of the Service, other accounts, or underlying infrastructure ("hacking").',
            'Reverse engineer, decompile, or disassemble any part of the Service.',
            'Scrape, crawl, or bulk-extract data from the Service outside of provided export features.',
            'Send spam, unsolicited messages, or use the chat feature for unrelated marketing.',
            'Harass, abuse, or threaten other users through the Service.',
            'Upload or distribute malware, viruses, or other harmful code.',
            'Use the Service for any illegal activity, including fraud, money laundering, or falsification of official documents.',
          ]),
        ],
      },
      {
        heading: '3. Consequences of Violation',
        body: [
          p('Violation of this Terms of Use may result in suspension or termination of your account, and where applicable, referral to law enforcement.'),
        ],
      },
    ],
  },

  'cookie-policy': {
    slug: 'cookie-policy',
    title: 'Cookie Policy',
    ...meta(),
    sections: [
      {
        heading: '1. What Are Cookies',
        body: [
          p('Cookies are small text files stored on your device that help us operate and improve the Service.'),
        ],
      },
      {
        heading: '2. Categories of Cookies We Use',
        body: [
          ul([
            'Essential cookies: required for core functionality such as page routing and security; cannot be disabled.',
            'Authentication cookies: keep you securely signed in between requests.',
            'Session cookies: maintain your session state while you use the Service and expire when you close your browser or log out.',
            'Preference cookies: remember settings such as language or display preferences.',
            'Analytics cookies: help us understand feature usage and improve the Service (used only where enabled).',
          ]),
        ],
      },
      {
        heading: '3. Managing Cookies',
        body: [
          p('You can manage or disable non-essential cookies through your browser settings. Disabling essential cookies may prevent parts of the Service from functioning correctly.'),
        ],
      },
    ],
  },

  'data-processing-agreement': {
    slug: 'data-processing-agreement',
    title: 'Data Processing Agreement (DPA)',
    ...meta(),
    sections: [
      {
        heading: '1. Roles',
        body: [
          p(`For personal data of your employees processed through the Service (e.g. attendance, payroll), you act as the "Controller" and ${PLACEHOLDERS.COMPANY_NAME} acts as the "Processor" under UAE PDPL and, where applicable, GDPR.`),
        ],
      },
      {
        heading: '2. Sub-processors',
        body: [
          p('We may engage sub-processors (e.g. cloud hosting, email/SMS delivery, AI/OCR providers) to perform processing on our behalf. Sub-processors are bound by data-protection obligations no less protective than those in this DPA. We will notify you of material changes to our sub-processor list where required by law or contract.'),
        ],
      },
      {
        heading: '3. Security Measures',
        body: [
          p('We implement appropriate technical and organizational measures, including encryption in transit, password hashing, role-based access control, and audit logging, as further described in our Security & Privacy Statement.'),
        ],
      },
      {
        heading: '4. Breach Notification',
        body: [
          p('In the event of a personal data breach affecting your data, we will notify you without undue delay after becoming aware of it, providing information reasonably necessary for you to meet your own regulatory notification obligations.'),
        ],
      },
      {
        heading: '5. Retention and Deletion',
        body: [
          p('Personal data is retained in line with our Data Retention Policy and deleted or anonymized upon expiry of the applicable retention period, or upon valid deletion request, subject to legal holds.'),
        ],
      },
      {
        heading: '6. Cross-Border Transfers',
        body: [
          p('Any cross-border transfer of personal data is carried out subject to appropriate safeguards consistent with UAE PDPL and GDPR requirements.'),
        ],
      },
      {
        heading: '7. Audit Rights',
        body: [
          p('Upon reasonable request and subject to confidentiality obligations, we will provide information reasonably necessary to demonstrate compliance with this DPA, including relevant security documentation.'),
        ],
      },
    ],
  },

  'security-privacy-statement': {
    slug: 'security-privacy-statement',
    title: 'Security & Privacy Statement',
    ...meta(),
    sections: [
      {
        heading: '1. Encryption',
        body: [
          p('Data in transit is encrypted using TLS. Sensitive data at rest is protected using industry-standard encryption provided by our infrastructure and database providers.'),
        ],
      },
      {
        heading: '2. Password Hashing',
        body: [
          p('Passwords are never stored in plaintext. We use one-way, salted cryptographic hashing (bcrypt) to store password credentials.'),
        ],
      },
      {
        heading: '3. Authentication',
        body: [
          p('The Service supports token-based authentication and optional two-factor authentication (TOTP) for an additional layer of account security.'),
        ],
      },
      {
        heading: '4. Role-Based Access Control',
        body: [
          p('Access to features and data within an organization\u2019s account is scoped by role (e.g. owner/admin vs. employee), limiting each user to the data and actions relevant to their role.'),
        ],
      },
      {
        heading: '5. Audit Logs',
        body: [
          p('Security-relevant events, including logins, legal-agreement acceptances, and sensitive data changes, are recorded in audit logs for accountability and incident investigation.'),
        ],
      },
      {
        heading: '6. Backups and Monitoring',
        body: [
          p('Production data is backed up on a regular schedule, and infrastructure is monitored for availability and anomalous activity.'),
        ],
      },
      {
        heading: '7. Incident Response',
        body: [
          p('We maintain an internal process for identifying, containing, and remediating security incidents, including notification obligations described in our Data Processing Agreement.'),
        ],
      },
      {
        heading: '8. Infrastructure and Tenant Isolation',
        body: [
          p('Each company/organization\u2019s data is logically isolated within the Service, so that one tenant cannot access another tenant\u2019s data.'),
        ],
      },
      {
        heading: '9. AI Security',
        body: [
          p('Documents processed through our AI/OCR pipeline are handled within access-controlled processing environments and are not used to train models for use outside your account.'),
        ],
      },
      {
        heading: '10. Secure Software Development Lifecycle',
        body: [
          p('Changes to the Service go through code review and testing practices intended to identify and remediate security issues before release.'),
        ],
      },
    ],
  },

  'data-retention-policy': {
    slug: 'data-retention-policy',
    title: 'Data Retention Policy',
    ...meta(),
    sections: [
      {
        heading: '1. Purpose',
        body: [
          p('This policy describes how long we retain different categories of data and the basis for those retention periods.'),
        ],
      },
      {
        heading: '2. Retention Periods',
        body: [
          ul([
            'Account data: retained for the life of the account, and up to 30 days after account deletion to allow for recovery, then permanently deleted or anonymized.',
            'Attendance records: retained for up to 7 years to support payroll, tax, and labor-law compliance.',
            'Payroll information: retained for up to 7 years in line with common tax and labor recordkeeping requirements.',
            'Invoices and AI-extracted invoice data: retained for up to 7 years for tax and audit purposes.',
            'Uploaded documents (timesheets, templates, signatures): retained while the account is active and for the same period as the records they support.',
            'Chat messages: retained for up to 2 years, or as long as the underlying employment relationship is active, whichever is longer.',
            'Notifications: retained for up to 12 months.',
            'Audit logs: retained for up to 7 years to support security investigations and compliance obligations.',
            'Deleted accounts: personal data is deleted or anonymized within 30 days of a confirmed deletion request, except where retention is legally required.',
            'Backups: rolled over on a regular cycle; deleted data is purged from backups within a reasonable period after the standard backup retention window.',
            'Temporary files (e.g. AI processing intermediates): deleted automatically, typically within 30 days of processing.',
          ]),
        ],
      },
      {
        heading: '3. Legal Holds',
        body: [
          p('Where data is subject to a legal hold, dispute, or regulatory investigation, retention periods above may be extended until the matter is resolved.'),
        ],
      },
    ],
  },
};

export const LEGAL_DOCUMENT_LIST = Object.values(LEGAL_DOCUMENTS).map((doc) => ({
  slug: doc.slug,
  title: doc.title,
  version: doc.version,
  effectiveDate: doc.effectiveDate,
  lastUpdated: doc.lastUpdated,
}));

export const getLegalDocument = (slug) => LEGAL_DOCUMENTS[slug] || null;

export const LEGAL_CONSENT_LABEL =
  'I have read and agree to the Privacy Policy, Terms & Conditions, Terms of Use, Cookie Policy, ' +
  'Data Processing Agreement, Security & Privacy Policy, and Consent to Data Processing.';

export default {
  LEGAL_BUNDLE_VERSION,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_LIST,
  getLegalDocument,
  LEGAL_CONSENT_LABEL,
};
