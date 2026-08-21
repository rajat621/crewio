# R2 Storage Patch - How to Apply

This contains ONLY the files that changed/were added for Cloudflare R2 support.
Copy each file into your real backend repo at the same relative path, overwriting
the existing one (except package.json.reference - see below).

New files:
  src/config/r2.client.js
  src/services/storage.service.js
  scripts/migrate-local-to-r2.js
  .gitignore   (your repo had none - review before overwriting if you already added one)

Modified files:
  src/config/env.js
  src/routes/upload.routes.js
  src/controllers/upload.controller.js
  src/controllers/files.controller.js
  src/controllers/invoice.controller.js
  src/models/FileRecord.js
  .env.example

package.json.reference:
  Don't overwrite your package.json with this. Just add these two lines to your
  existing "dependencies" block, then run npm install:
    "@aws-sdk/client-s3": "^3.700.0",
    "@aws-sdk/s3-request-presigner": "^3.700.0",

After copying files in:
  1. npm install
  2. Confirm the app still boots fine as-is (STORAGE_DRIVER defaults to "local",
     so nothing changes yet - this is safe to deploy immediately).
  3. See the chat message for what to do once you've actually purchased R2.
