// lib/core/legal/legal_documents.dart
//
// IMPORTANT: this is placeholder legal copy written to be reasonable and
// clearly structured, NOT a substitute for review by an actual lawyer.
// Because this app tracks employee location, attendance, and pay data,
// have these reviewed (and update the placeholders marked [ ]) before
// this goes in front of real workers.

/// A single legal document plus the metadata needed to (a) render it and
/// (b) record a legally meaningful acceptance of it.
class LegalDocument {
  final String key; // stable identifier, sent to the backend - never rename
  final String title;
  final String version;
  final String effectiveDate;
  final String content;

  const LegalDocument({
    required this.key,
    required this.title,
    required this.version,
    required this.effectiveDate,
    required this.content,
  });
}

class LegalDocuments {
  const LegalDocuments._();

  static const String lastUpdated = '[Month Year]';
  static const String effectiveDate = '[Month Day, Year]';

  /// Bump this whenever ANY document below changes in a way that's
  /// materially different from what a worker previously accepted (not for
  /// typo fixes). Bumping this is what triggers the mandatory
  /// re-acceptance flow on next login - see LegalAcceptanceService.
  static const String currentAcceptanceVersion = '1.0.0';

  // ---------------------------------------------------------------------
  static const String termsOfUse = '''
TERMS OF USE
Last updated: $lastUpdated

1. WHO THIS APP IS FOR
This app ("the App") is a companion app for CrewControl (also referred to
as "Crewio"), a workforce management platform. The App only works for
workers whose employer ("your Organization") is already a registered
CrewControl customer using it to record attendance, assignments, and pay.
If your Organization does not use CrewControl, this App has no function
for you - there is no independent account you can create outside of an
Organization's CrewControl workspace.

2. YOUR ACCOUNT
- Your account is created and managed by your Organization (typically by
  an office administrator), not by you directly.
- You are responsible for keeping your login credentials confidential and
  for all activity recorded under your account.
- You must use your own account only. Sharing your login, or checking in
  or recording attendance on behalf of another worker, is not permitted
  and may be treated as a violation of your Organization's policies.

3. WHAT YOU CAN DO WITH THE APP
You may use the App to: view your work assignments, record attendance
(check-in/check-out), view salary slips and advances, view and respond to
messages from your office, and receive notifications about the above.

4. WHAT YOU MAY NOT DO
- Attempt to falsify attendance, location, or work records.
- Attempt to access another worker's account or data.
- Reverse-engineer, decompile, or interfere with the App's normal
  operation.
- Use the App for any purpose other than the workforce management
  functions it's built for.

5. DEVICE PERMISSIONS
The App requests location and notification permissions to do its job (see
the Privacy Policy for exactly how each is used). You can decline or later
revoke these permissions in your device settings, but some features (for
example, location-based attendance verification) may stop working if you
do.

6. SUSPENSION AND TERMINATION
Your access can be suspended or ended by your Organization (for example,
if your employment ends) or by CrewControl if we reasonably believe this
App is being misused. Ending your access does not remove records your
Organization is required to keep for payroll, tax, or labor-law purposes.

7. CHANGES TO THESE TERMS
We may update these Terms of Use from time to time. Continuing to use the
App after an update means you accept the revised terms. Material changes
will be flagged the next time you log in.

8. CONTACT
Questions about these Terms of Use should be directed to your
Organization's office administrator, or to [support contact / email].
''';

  // ---------------------------------------------------------------------
  static const String termsAndConditions = '''
TERMS AND CONDITIONS
Last updated: $lastUpdated

1. THE RELATIONSHIP BETWEEN YOU, YOUR ORGANIZATION, AND CREWCONTROL
CrewControl provides workforce management software to your Organization
(your employer or labor contractor). Your Organization is our customer;
you, as a worker, are a user of the software on your Organization's
behalf. Your Organization is responsible for how it uses your data within
the platform (for example, deciding your pay calculations, site
assignments, and attendance policy) - CrewControl provides the software
that records and displays this information.

2. ELIGIBILITY
You may only use this App if:
(a) you have been added as an employee by an Organization that is an
    active CrewControl customer, and
(b) you have been issued valid login credentials by that Organization.
This App is not a general-purpose consumer product and is not intended to
function, and will not function, independently of an Organization's
CrewControl account.

3. ACCURACY OF RECORDS
Attendance, location, and timesheet data recorded through the App is used
by your Organization for payroll and compliance purposes. You agree to
use the App honestly and to promptly flag any records you believe are
incorrect to your office.

4. AVAILABILITY
We aim to keep the App and its notification/push services available, but
we do not guarantee uninterrupted access. Push notifications depend on
Google's Firebase Cloud Messaging service and your device's connectivity;
delivery timing is not guaranteed, particularly if your device is offline
or powered off for an extended period.

5. LIMITATION OF LIABILITY
To the extent permitted by law, CrewControl is not liable for indirect,
incidental, or consequential damages arising from your use of the App.
Disputes about pay, attendance, or employment terms are between you and
your Organization; CrewControl's role is limited to providing the
software platform.

6. INDEMNIFICATION
You agree not to misuse the App in a way that causes loss to CrewControl
or your Organization (for example, deliberately falsifying records), and
to be responsible for any such misuse to the extent permitted by law.

7. GOVERNING LAW AND DISPUTES
These Terms are governed by the laws of [jurisdiction]. Any disputes will
first be attempted to be resolved informally; unresolved disputes will be
handled in the courts of [jurisdiction].

8. CHANGES
We may revise these Terms and Conditions periodically. We'll flag
material changes the next time you log in.

9. CONTACT
Questions about these Terms and Conditions should be directed to your
Organization's office administrator, or to [support contact / email].
''';

  // ---------------------------------------------------------------------
  static const String privacyPolicy = '''
PRIVACY POLICY
Last updated: $lastUpdated

1. WHAT DATA WE COLLECT
- Account & profile: name, phone number, photo, and other details your
  Organization enters or you update in your profile.
- Attendance & work data: check-in/check-out times, site assignments,
  leave records, and work session duration.
- Location data: your device's GPS location, collected during active
  work sessions (and, if you've enabled it, periodically in the
  background) to verify on-site attendance. Location is not collected
  when you are not checked in for work, beyond what's needed for a
  one-time on-demand location request from your office, if used.
- Pay data: salary slips, advances, and deductions, as generated by your
  Organization.
- Communications: messages sent through the in-app Chat/Inbox with your
  office.
- Device data: a Firebase Cloud Messaging (FCM) push token, used only to
  deliver notifications to your device, and basic device/app diagnostic
  information for troubleshooting.

2. HOW WE USE YOUR DATA
- To record and display your attendance, assignments, pay, and messages.
- To send you push notifications (salary slip ready, site assignment,
  new message, etc.) via Firebase Cloud Messaging.
- To let your Organization manage its workforce (this is the core
  purpose of the platform).
- We do not sell your data, and we do not use your location or attendance
  data for advertising.

3. WHO CAN SEE YOUR DATA
- Your Organization's authorized office staff can see the work-related
  data described above (attendance, location during work sessions,
  assignments, pay, messages).
- CrewControl's infrastructure providers (for example, our database host
  and Google Firebase for push notifications) process data on our behalf
  under standard confidentiality and security obligations - they do not
  independently use your data for their own purposes.
- We do not share your data with unrelated third parties or advertisers.

4. HOW LONG WE KEEP YOUR DATA
Attendance and pay records are generally kept for as long as your
Organization is required to retain them for payroll, tax, or labor-law
compliance (commonly several years after the record is created), even
after your employment ends. You can ask your Organization about its
specific retention practices.

5. YOUR CHOICES
- You can deny or later revoke location and notification permissions in
  your device settings; some features (like automatic attendance
  verification) may not work correctly if you do.
- To request a copy of, or a correction to, your personal data, contact
  your Organization's office administrator, who administers your account.

6. SECURITY
We use industry-standard measures to protect your data in transit
(HTTPS/TLS) and store authentication tokens using your device's secure
keystore (Android Keystore / iOS Keychain) rather than plain storage.

7. CHILDREN
This App is intended for use by employed adults and is not directed at
children.

8. CHANGES TO THIS POLICY
We may update this Privacy Policy from time to time. We'll flag material
changes the next time you log in.

9. CONTACT
Questions about this Privacy Policy should be directed to your
Organization's office administrator, or to [support contact / email].
''';

  // ---------------------------------------------------------------------
  static const String cookiePolicy = '''
COOKIE POLICY
Last updated: $lastUpdated

This App itself does not use browser cookies (it's a native mobile app,
not a website). This policy covers the equivalent on-device technologies
the App and its companion web dashboard use.

1. ON-DEVICE STORAGE WE USE
- Secure storage (Android Keystore / iOS Keychain) for your login session
  tokens, so you don't have to log in again every time you open the App.
- Local app storage for offline caching of your schedule, attendance
  records, and these legal documents, so the App remains usable with a
  weak or no connection.
- A Firebase Cloud Messaging (FCM) registration token, used solely to
  route push notifications to your device.

2. WHAT WE DO NOT USE
- No third-party advertising cookies or SDKs.
- No cross-app or cross-site tracking identifiers.
- No Advertising ID is read or used by this App.

3. WEB DASHBOARD
If your Organization's office staff access CrewControl through the web
dashboard, that dashboard uses standard browser cookies for session
management (keeping them logged in) and, if enabled by your Organization,
basic analytics cookies. This does not apply to the mobile App itself.

4. YOUR CONTROLS
You can clear the App's local storage at any time via your device's
Settings > Apps > CrewControl > Storage > Clear Data - this will log you
out and remove any offline-cached content, but will not affect the
records your Organization holds on the backend.

5. CHANGES
We may update this Cookie Policy from time to time. We'll flag material
changes the next time you log in.

6. CONTACT
Questions about this Cookie Policy should be directed to your
Organization's office administrator, or to [support contact / email].
''';

  // ---------------------------------------------------------------------
  static const String dataProcessingAgreement = '''
DATA PROCESSING AGREEMENT (SUMMARY)
Last updated: $lastUpdated

This summary describes the processor relationship between CrewControl
and your Organization for the personal data handled through this App.
The full Data Processing Agreement is executed between CrewControl and
your Organization as part of their commercial contract; this in-app
summary is provided to workers for transparency.

1. ROLES
- Your Organization (your employer) is the data controller: it decides
  what data is collected and why (attendance policy, pay rules, etc.).
- CrewControl is the data processor: it processes worker data only on
  your Organization's documented instructions, via the App and dashboard.

2. SCOPE OF PROCESSING
CrewControl processes the categories of data described in the Privacy
Policy (profile, attendance, location during work sessions, pay records,
in-app messages, device/notification tokens) solely to provide the
workforce management service to your Organization.

3. SUB-PROCESSORS
CrewControl uses a limited set of infrastructure sub-processors (for
example, cloud hosting and Google Firebase for push notification
delivery), each bound by confidentiality and data-protection obligations
consistent with this Agreement. CrewControl does not permit sub-processors
to use worker data for their own independent purposes.

4. SECURITY MEASURES
CrewControl maintains technical and organizational measures including
encryption in transit (TLS/HTTPS), encrypted credential storage on
device, access controls limiting dashboard access to authorized office
staff, and audit logging of legal-acceptance and account-access events.

5. DATA SUBJECT REQUESTS
Requests to access, correct, or restrict processing of your personal data
should go through your Organization's office administrator, who can
instruct CrewControl accordingly as the processor.

6. RETENTION AND DELETION
CrewControl retains data for the periods documented in the Data Retention
Policy and instructed by your Organization, and deletes or anonymizes
data once neither party is required to retain it.

7. INTERNATIONAL TRANSFERS
Where data is processed in a country other than your Organization's, this
is done under appropriate safeguards consistent with applicable data
protection law.

8. CONTACT
Questions about data processing should be directed to your Organization's
office administrator, or to [support contact / email].
''';

  // ---------------------------------------------------------------------
  static const String securityPrivacyStatement = '''
SECURITY & PRIVACY STATEMENT
Last updated: $lastUpdated

This statement summarizes, in plain language, the concrete security
measures protecting your data in this App.

1. DATA IN TRANSIT
All communication between the App and our servers uses HTTPS/TLS
encryption. No login credentials, tokens, or work data are ever sent
unencrypted.

2. DATA AT REST ON YOUR DEVICE
- Authentication tokens are stored in your device's secure hardware-backed
  keystore (Android Keystore / iOS Keychain), not in plain app storage.
- We do not store your password on the device after login.

3. AUTHENTICATION
- Sessions expire automatically and are refreshed using a short-lived
  token exchange; a revoked or expired session requires signing in again.
- Repeated failed logins may be rate-limited by your Organization's
  administrator settings.

4. LOCATION DATA HANDLING
Location is requested only when needed for attendance verification,
explained in-app before the permission prompt appears, and is not
collected continuously in the background beyond what your Organization
has configured for legitimate attendance/geofence purposes.

5. ACCESS CONTROLS
Only your Organization's authorized office staff can view your work data
through the dashboard; role-based permissions restrict what each staff
account can see or edit.

6. AUDIT LOGGING
Security-relevant events - including legal-document acceptance, login,
and account-deactivation requests - are logged with a timestamp for audit
and compliance purposes.

7. INCIDENT RESPONSE
In the event of a data security incident affecting your personal data, we
will notify your Organization, who is responsible for notifying affected
workers as required by applicable law.

8. REPORTING A CONCERN
If you believe you've found a security vulnerability, report it to
[security contact / email] rather than to your Organization's office
staff, so it can be triaged directly by the engineering team.

9. CONTACT
Questions about this statement should be directed to your Organization's
office administrator, or to [support contact / email].
''';

  // ---------------------------------------------------------------------
  static const String dataRetentionPolicy = '''
DATA RETENTION POLICY
Last updated: $lastUpdated

1. WHY WE RETAIN DATA
As a workforce management platform, CrewControl retains certain worker
data on behalf of your Organization because your Organization is legally
required to keep payroll, attendance, and tax-related records for a
minimum period under applicable labor law, even after your employment
ends.

2. RETENTION PERIODS
- Attendance & timesheet records: retained for the period your
  Organization configures to meet its statutory record-keeping
  obligations (commonly several years).
- Payroll & salary slip records: retained per your Organization's payroll
  and tax retention requirements.
- Chat/messaging history: retained according to your Organization's
  configured retention policy.
- Legal-acceptance audit records (who accepted which version, when):
  retained indefinitely as a compliance record, since it evidences
  consent to terms that were in effect at a given time.
- Location data tied to a specific attendance event: retained alongside
  that attendance record for the same period; location is not retained
  independently of an attendance/work event.

3. WHAT HAPPENS WHEN YOU LEAVE YOUR ORGANIZATION
Your login is deactivated and cannot be used to sign in, but your work
records (described above) are NOT deleted, because they belong to your
Organization and are needed for payroll, audit, and legal-compliance
purposes. See "Request Account Deactivation" in the App's Legal & Privacy
settings for how deactivation works.

4. DELETION
Data is deleted or anonymized once your Organization confirms it is no
longer required to retain it under its own record-retention schedule and
applicable law. Because these records are the property and legal
obligation of your Organization (not CrewControl unilaterally), deletion
requests are handled through your Organization's administrator.

5. CHANGES
We may update this Data Retention Policy from time to time. We'll flag
material changes the next time you log in.

6. CONTACT
Questions about data retention should be directed to your Organization's
office administrator, or to [support contact / email].
''';

  /// All documents a worker must review and accept, in display order.
  /// UI (login checkbox, Legal & Privacy settings page) should iterate this
  /// list rather than hardcoding individual documents, so adding a new
  /// required document only requires editing this file.
  static const List<LegalDocument> all = [
    LegalDocument(
      key: 'privacy_policy',
      title: 'Privacy Policy',
      version: currentAcceptanceVersion,
      effectiveDate: effectiveDate,
      content: privacyPolicy,
    ),
    LegalDocument(
      key: 'terms_and_conditions',
      title: 'Terms & Conditions',
      version: currentAcceptanceVersion,
      effectiveDate: effectiveDate,
      content: termsAndConditions,
    ),
    LegalDocument(
      key: 'terms_of_use',
      title: 'Terms of Use',
      version: currentAcceptanceVersion,
      effectiveDate: effectiveDate,
      content: termsOfUse,
    ),
    LegalDocument(
      key: 'cookie_policy',
      title: 'Cookie Policy',
      version: currentAcceptanceVersion,
      effectiveDate: effectiveDate,
      content: cookiePolicy,
    ),
    LegalDocument(
      key: 'data_processing_agreement',
      title: 'Data Processing Agreement',
      version: currentAcceptanceVersion,
      effectiveDate: effectiveDate,
      content: dataProcessingAgreement,
    ),
    LegalDocument(
      key: 'security_privacy_statement',
      title: 'Security & Privacy Statement',
      version: currentAcceptanceVersion,
      effectiveDate: effectiveDate,
      content: securityPrivacyStatement,
    ),
    LegalDocument(
      key: 'data_retention_policy',
      title: 'Data Retention Policy',
      version: currentAcceptanceVersion,
      effectiveDate: effectiveDate,
      content: dataRetentionPolicy,
    ),
  ];
}
