# CrewControl Employee App - Legal/Compliance/Security Pass

This zip contains ONLY the files that were added or modified for this pass
- not the whole project. Copy each file into your project at the matching
relative path (they overwrite the originals except for the new files,
which are new additions).

## How to apply
1. Unzip this over your project root (paths match your existing structure
   exactly - `lib/...`, `android/...`, `pubspec.yaml`, etc.)
2. Run `flutter pub get` (new deps: `device_info_plus`, `package_info_plus`,
   `cached_network_image`)
3. Copy `android/key.properties.example` to `android/key.properties` and
   fill in real values before producing a release build (see that file's
   comments for how to generate an upload keystore)
4. Fill in the real production API URL in `.env.prod` (still a placeholder)
5. Read `docs/PLAY_STORE_DATA_SAFETY.md` before filling out Play Console's
   Data Safety form
6. Two backend endpoints need to exist for the legal-acceptance flow to
   fully work (they fail gracefully/queue-and-retry if missing, but won't
   be a real audit trail until they exist):
   - `POST /api/mobile/legal/accept` - records acceptedAt/version/device
     metadata against the logged-in worker
   - `GET /api/mobile/legal/version` - returns `{ "requiredVersion": "1.0.0" }`,
     the currently-required legal version, so returning workers get forced
     re-acceptance after you bump `LegalDocuments.currentAcceptanceVersion`
   - `POST /api/mobile/account/deactivation-request` - notifies the
     dashboard admin of a deactivation request

## What changed, by spec section

**1-2 (Legal acceptance + documents):** all 7 required documents now exist
with version/effective-date metadata (`legal_documents.dart` - added
Cookie Policy, DPA, Security & Privacy Statement, Data Retention Policy;
previously only 3 of 7 existed). New `LegalAcceptanceService` records
acceptedAt/version/appVersion/devicePlatform/deviceModel/userAgent and
syncs to the backend with offline-safe retry (acceptedIp is intentionally
NOT sent from the client - have your backend stamp it from the request,
a client-reported IP isn't trustworthy for an audit record). Login screen
rewired to the full 7-document checklist and preserves entered
ID/password when a document is opened (unchanged behavior, now verified).

**3 (Legal & Privacy in settings):** added to Profile page without
touching the rest of the layout.

**4 (Version management):** new forced re-acceptance screen
(`legal_reacceptance_page.dart`) triggers after login if the backend
reports a newer required version than what's stored locally; credentials
stay intact.

**5 & 7 (Permissions / location privacy):** removed
`ACCESS_BACKGROUND_LOCATION` from the manifest - it was declared but never
actually used (nothing in the code requests background/Always location;
no foreground service or WorkManager exists). `BackgroundLocationService`
(name kept, behavior fixed) now only polls while the worker is actually
checked in AND the app is in the foreground - previously it ran
unconditionally for the lifetime of the Home screen regardless of
check-in state. Location-permission screen copy rewritten to explain the
actual purpose instead of a generic "maps" placeholder.

**6 (Data Safety):** see `docs/PLAY_STORE_DATA_SAFETY.md`.

**8 (Account deactivation, not deletion):** new
`account_deactivation_page.dart` + `ProfileService.requestAccountDeactivation()`.

**9 (Security):** confirmed no SharedPreferences usage anywhere (secure
storage only - already compliant). Fixed a real gap: when a refresh token
is revoked/expired, tokens were cleared but nothing navigated the user
back to login, leaving them stranded on a dead screen - now force-routes
to `/login`. Added FLAG_SECURE screenshot/screen-recording protection
(`screen_security_service.dart`) on the two financial screens (salary
slips, view advance) via `MainActivity.kt` method channel - Android only,
iOS has no equivalent API. Release build signing/minification fixed (see
section 14 below).

**10 (Notification privacy):** foreground-shown notifications now use
`NotificationVisibility.private` so lock-screen previews don't leak
content; flagged that the backend must also keep payroll/chat specifics
out of push title/body (background/terminated-state pushes are rendered
directly by the OS from the FCM payload, which this client can't control).

**13 (Performance):** profile avatar now uses `cached_network_image`
(disk-cached) instead of plain `NetworkImage` (memory-only, re-downloads
every cold start).

**14 (Release build readiness):** real release signing config wired up
(reads `android/key.properties`, git-ignored, falls back to debug signing
only when that file is absent so local builds without secrets still
work); R8 minification + resource shrinking enabled (were both `false`);
added `proguard-rules.pro` (didn't exist, would have broken the build the
moment minification was turned on); **fixed the env-file bug** -
`ServiceLocator.setup()` was hardcoded to always load `.env.dev`
regardless of build type, meaning even a release build would point at
the dev/LAN API URL - now picks `.env.prod` for release builds via
`kReleaseMode`. `debugShowCheckedModeBanner` was already `false`.
Package name (`com.example.aquas`) intentionally NOT changed - see the
TODO comment in `build.gradle.kts` for why that's a one-way decision
requiring coordinated Firebase reconfiguration, not something to change
silently.

## Not addressed in this pass - needs your input or is a separate feature

- **Chat (section 11):** `chat_detail_page.dart` and the chat message
  models are currently empty placeholder files - there's no unread badge,
  read receipts, or message status to improve because the detail screen
  isn't built yet. This is a real feature build, not a compliance
  retrofit - happy to scope it separately once you confirm the current
  backend chat API shape.
- **Accessibility (section 12):** dynamic font scaling already works
  (no hardcoded text scale factor found anywhere). A full semantic-label
  audit (Semantics widgets on icon-only buttons, contrast check, etc.)
  across ~650 files wasn't attempted blind - tell me which screens matter
  most and I'll do a real pass on those.
- **Package name / applicationId** - your call, see note above.
- **.env.prod** still has a placeholder API URL.
- **Certificate pinning** - scaffolded in `api_client.dart` but not
  active; needs real SHA-256 pins generated from your production cert.
- Sections 15-17 (Play Store checklist / final audit) are a rollup of
  everything above - once the "Not addressed" items are resolved and
  `key.properties` + `.env.prod` are filled in, the checklist in the
  original spec is satisfied by what's in this zip.
