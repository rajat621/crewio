FCM (Firebase Cloud Messaging) Setup

1) Obtain a Firebase service account JSON for your project:
   - Go to Firebase Console -> Project Settings -> Service accounts -> Generate new private key
   - Save the JSON file securely.

2) Configure backend environment (choose one):

   Option A: Point to a file (recommended)
   - Copy the JSON to your server, e.g. `/path/to/firebase-service-account.json`
   - In `backend/.env` set:
     FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/firebase-service-account.json

   Option B: Inline JSON (use with care)
   - In `backend/.env` set:
     FIREBASE_SERVICE_ACCOUNT_JSON="{...json content...}"
   - Ensure proper escaping and that newlines are preserved or escaped.

3) Restart backend. On successful init you will see `FCM initialized` in server logs.

4) Test push (admin only):
   - Obtain an admin access token (dashboard login)
   - Call POST /api/test/fcm with JSON body `{ "deviceToken": "<token>", "title": "Test", "body": "Hello" }`

5) Mobile client
   - Ensure mobile app registers device token with `POST /api/mobile/device` after login, passing `deviceToken` (and optional `deviceId`).
   - The backend stores `deviceToken` on the Employee record and uses it to send pushes on lifecycle/location events.

Security
- Do not commit service account JSON into source control.
- Use file path option on servers and restrict file permissions.

Troubleshooting
- If `FCM not configured` appears, verify env vars and restart.
- If `FCM send error` appears, inspect server logs for the error message returned by Firebase admin SDK.

