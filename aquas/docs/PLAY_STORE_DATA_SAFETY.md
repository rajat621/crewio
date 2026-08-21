# Google Play Data Safety Form - Reference Mapping

This maps what CrewControl's mobile app actually collects/sends (verified
against the service layer in `lib/core/services/`) to the categories on
Google Play Console's Data Safety form. Use this as the source of truth
when filling out the form - don't guess from memory, the actual
transmitted fields matter for a passing review.

**All data below is transmitted over HTTPS/TLS (see `api_client.dart` -
plain HTTP is never used).**

## Data collected

| Category (Play Console) | Specific data | Collected? | Purpose | Optional/Required | Source |
|---|---|---|---|---|---|
| Personal info | Name | Yes | App functionality (identify the worker) | Required | `profile_service.dart` |
| Personal info | Employee/User ID | Yes | App functionality, account management | Required | `auth_service.dart` |
| Personal info | Phone number | Yes | App functionality | Required (set by admin) | `profile_service.dart` |
| Personal info | Address | Yes | App functionality (worker profile) | Optional | `profile_service.dart` |
| Photos | Profile photo | Yes | App functionality | Optional | `profile_service.dart` + `image_picker` |
| Location | Precise location (GPS) | Yes | App functionality (attendance/on-site verification) | Required for attendance features | `attendance_service.dart`, `realtime_service.dart`, `background_location_service.dart` - foreground-only, see note below |
| Financial info | Salary slips, advances | Yes | App functionality (payroll display) | Required (employer-generated) | `salary_service.dart` |
| Messages | In-app chat messages | Yes | App functionality | Required if chat used | `chat_service.dart` |
| App activity | Attendance / check-in-out events, timesheets | Yes | App functionality, analytics (employer-side) | Required | `attendance_service.dart` |
| App activity | Crash logs / diagnostics | Yes (if you add a crash reporter - none is currently wired in) | Analytics | N/A until added | — |
| Device or other IDs | Firebase push notification token | Yes | App functionality (delivering notifications) | Required for notifications | `push_notification_service.dart` |
| Device or other IDs | Device model / platform / app version | Yes | App functionality (legal-acceptance audit trail only) | Required for legal compliance | `legal_acceptance_service.dart` |
| Advertising ID | — | **No** | — | — | Not read anywhere in this codebase |

## Data NOT collected

Explicitly confirm "No" for these categories in the form - nothing in this
codebase touches them:
- Web browsing history
- Health & fitness data
- Contacts
- Calling/SMS/call logs
- Files & docs beyond what the worker explicitly uploads (profile photo,
  chat attachments if that feature is enabled)
- Purchases

## Data shared with third parties

| Recipient | What's shared | Why |
|---|---|---|
| Google Firebase Cloud Messaging | Push token, notification payload | Delivering push notifications |
| Your backend infrastructure provider | All of the above | Hosting the CrewControl service your Organization runs |

No data is sold, and no data is shared with advertisers or data brokers.

## Encryption

- **In transit:** TLS/HTTPS for all API calls (`api_client.dart`); optional
  certificate pinning is scaffolded (`ApiClient.pinnedCertSha256`) but
  needs real pin values generated for your production cert before it's
  active.
- **At rest on-device:** Auth tokens and the legal-acceptance record are in
  `flutter_secure_storage` (Android Keystore / iOS Keychain) - never in
  SharedPreferences or plain files. Confirmed: no `SharedPreferences`
  usage anywhere in `lib/`.

## Data deletion

- Workers **cannot** self-delete their account or business records from
  the app (by design - see `docs`/spec section 8, and
  `account_deactivation_page.dart`). They can submit a **deactivation
  request** instead, which notifies the Organization's dashboard admin.
- On Play Console's Data Safety form, answer "no" to "users can request
  data deletion" **from within the app**, but describe the deactivation
  request as the deletion pathway, since Play Console does accept an
  external/admin-mediated deletion process as long as it's disclosed - a
  link to the Data Retention Policy in-app (Profile > Legal & Privacy)
  satisfies the disclosure requirement.

## Location data - background vs. foreground

As of this pass, the app is foreground-location-only:
- `AndroidManifest.xml` no longer declares `ACCESS_BACKGROUND_LOCATION`
  (it was declared but unused - nothing in the code ever requested
  `Permission.locationAlways`).
- `BackgroundLocationService` (name kept, behavior changed) now only polls
  while the worker is checked in AND the app is in the foreground -
  see `home_page.dart`'s `_hasCheckedIn` setter and
  `didChangeAppLifecycleState`.
- On the Data Safety form's location section, select **"Approximate or
  precise location - collected, foreground only."** Do NOT check the
  background-location box unless that changes.

## Action items for whoever fills out the actual Play Console form

1. Confirm whether crash reporting (e.g. Firebase Crashlytics) will be
   added before launch - it isn't currently wired in, but is commonly
   expected; if added, declare "Crash logs" and "Diagnostics" data types.
2. Confirm whether chat supports file/image attachments in its final
   shipped form - affects the "Files and docs" declaration.
3. Fill in the real production API URL in `.env.prod` (currently a
   placeholder) before the release build is generated.
