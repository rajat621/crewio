# Storage migration — Cloudflare R2 as primary backend

## Files changed (drop-in replacements, same paths in your repo)
- `src/services/storage.service.js` — expanded from 4 methods to the full API
- `src/controllers/files.controller.js` — download endpoint rewritten
- `src/controllers/invoice.controller.js` — timesheet/invoice PDF handling rewritten
- `src/services/salarySlipPdf.service.js` — logo resolution rewritten, dead duplicate code removed
- `src/services/pdf.service.js` — legacy/unused generator brought in line (not currently wired to any route)

## storage.service.js — new API surface
```
buildTenantKey({ companyId, ownerId, folder, filename })   // unchanged
driverFromStoredPath(storedPath)                            // infer 'local'|'r2' from a saved string
saveBuffer({ ... })                                         // unchanged behavior
saveLocalFile({ absolutePath, ... })                        // now always routes through saveBuffer
objectExists({ key, driver })
getObjectBuffer({ key, driver })
downloadToTempFile({ key, driver, filename })                // -> { path, isTemp, cleanup() }
downloadToTempDirectory({ key, driver, filename })            // -> { dir, path, cleanup() }
getSignedUrl({ key, driver, expiresIn })
streamObject({ key, driver, res, contentType, disposition })  // pipes straight into an Express response
getAccessUrlOrPath({ key, driver })                           // unchanged, now built on the primitives above
deleteObject({ key, driver })
cleanupTempFile(path) / cleanupTempDirectory(dir)
reserveTempFilePath(filename)                                 // fresh path for a file you're about to render
```
Everything is driver-explicit: pass `driver` when you have it (e.g.
`FileRecord.storageDriver`), and it'll fall back to the global
`STORAGE_DRIVER` env var when you don't. `driverFromStoredPath()` covers the
common case of records that predate the `storageDriver` field — local paths
always start with `/`, R2 keys never do.

## What actually needed to change (scope notes)

**Smaller than the original brief assumed, for two structural reasons already
true in this codebase before I touched anything:**

1. **Company branding assets (invoice template, signature, stamp) are stored
   as inline base64 data URIs on the `Company` document, not as files.**
   `invoiceRenderer.service.js`'s `fs.existsSync`/`readFileSync` calls for
   those are a legacy fallback for old pre-data-URI records, not the active
   path. I left that fallback as plain `fs` — it only ever receives a path
   that's already local (see point 2), so it doesn't need to be
   storage-aware itself.

2. **The Python AI microservice (`ai-services/`) has no S3/R2 client and
   never will need one.** It's called over HTTP with a bare `pdf_path`
   string and only ever touches its own local filesystem. So "the AI
   pipeline must never fail because a file only exists in R2" is entirely a
   **Node-side** concern: `invoice.controller.js` now downloads the source
   timesheet to a temp file *before* calling `extractDocument()`, and cleans
   it up after. Nothing in the Python service changed or needs to.

Given that, the actual rule enforced everywhere now is:
- **storage.service.js** is the only place that knows about `fs`/R2 for
  uploaded or generated assets.
- **Rendering libraries** (`pdf-lib` in `invoiceRenderer.service.js`,
  `pdfkit` in `pdf.service.js`) still take a plain local path — that's
  inherent to those libraries — but the *caller* is now responsible for
  making sure that path is either a genuinely local file or a temp file
  freshly pulled from storage, and for cleaning it up afterward.

## invoice.controller.js — before/after per flow

- **`extractInvoiceDraft`**: was `toAbsoluteStoragePath` + `fs.existsSync`.
  Now: `objectExists()` against the FileRecord's driver/key, then
  `downloadToTempFile()` → pass the temp path to the AI service → `cleanup()`
  in a `finally`.
- **`createInvoice`**: same pattern for the source timesheet, but the temp
  file is downloaded once and reused for both extraction and the
  `AttendanceImport` record (which stores the *original* stored path string,
  not the temp path — important, since the temp path is ephemeral).
  Cleanup happens after the AttendanceImport write, and also in the outer
  `catch` if anything fails partway through.
- **PDF generation**: `outputAbsolutePath` used to be
  `folderMap.invoices/<num>.pdf` (a fixed spot inside the local storage
  tree, which doesn't exist as a concept on R2). It's now
  `reserveTempFilePath()` — a disposable path in the OS temp dir, used by
  `renderInvoicePdf()` as a working file, then persisted via
  `saveLocalFile()` (which now uniformly funnels through `saveBuffer()` for
  *both* drivers) and deleted immediately after. No generated PDF is ever
  left sitting in local storage outside of the one canonical copy
  `saveBuffer` writes for the local driver.
- **`downloadInvoice`**: was `fs.existsSync` + `fs.readFileSync` +
  `res.send(buffer)`. Now: `objectExists()` + `streamObject()`, same
  pattern as `files.controller.js`.

## files.controller.js
Was: R2 branch got a signed-URL redirect, local branch did its own
`fs.existsSync`/`createReadStream`/`pipe`. Now both branches go through
`objectExists()` + `streamObject()` — no `fs` import left in this file at
all, and no more risk of the two branches drifting apart.

## salarySlipPdf.service.js
- Deleted ~230 lines of dead, fully-commented-out duplicate code sitting
  above the real module (pre-existing clutter, unrelated to storage, but it
  was shadowing greps for `fs.existsSync` with false hits).
- `tryResolveLogoBytes()`'s `logoFileId` and "logo as a relative path"
  branches now go through `objectExists()`/`getObjectBuffer()` instead of
  `toAbsoluteStoragePath()` + `fs`.

## pdf.service.js
This module (`generatePdf`) isn't imported by any controller or route today
— the active salary-slip/invoice paths go through
`Salaryslipjspdf.service.js` and `invoiceRenderer.service.js` instead. Fixed
it anyway so it doesn't reintroduce a hardcoded local path if it's ever
wired back up: writes to `reserveTempFilePath()`, waits for the stream to
finish, persists via `saveLocalFile()`, cleans up the temp copy.

## Re-audit (per the "search entire project again" step)
```
grep -rn "fs\.\(existsSync\|readFileSync\|createReadStream\|createWriteStream\|writeFileSync\|unlinkSync\|mkdirSync\)" src/ \
  | grep -v node_modules | grep -v /tests/ | grep -v /scripts/
```
Remaining hits, all expected/allowed:
- `storage.service.js` — the abstraction layer itself (the only place fs is
  allowed to appear for uploaded/generated assets).
- `push.service.js` — reads the Firebase service-account credentials file
  from `FIREBASE_SERVICE_ACCOUNT_PATH`. This is app configuration, not a
  tenant-uploaded asset — out of scope per the brief's own exception list.
- `invoiceRenderer.service.js` / `pdf.service.js` — `pdf-lib`/`pdfkit`
  writing to (and `invoiceRenderer` reading template bytes from) a local
  working path, always supplied by a caller that already resolved it via
  `storage.service.js`.

`storageRoot` / `folderMap` / `toAbsoluteStoragePath` no longer appear
anywhere except `storage.service.js` itself and the one deliberately-kept
legacy fallback in `invoice.controller.js` (documented inline) for the rare
pre-data-URI company branding record.

## Things I could NOT verify without your deployment details (please check)
1. **Node ↔ Python shared filesystem.** `extractDocument()` posts a bare
   `pdf_path` to the AI service over HTTP. That only works if the Node
   process's temp directory is on a filesystem the Python service can also
   read — true if they're the same container/pod with a shared volume,
   false if they're fully separate hosts. This was already true before my
   changes (nothing here makes it better or worse), but it's the one place
   where "R2 becomes the single source of truth" doesn't fully hold unless
   you also share that temp volume — worth confirming.
2. **`STORAGE_DRIVER=r2` env validation** already existed in `env.js` and
   fails fast in production if R2 vars are missing — unchanged, just noting
   it's still in effect.
3. I did not add a scheduled sweep of `os.tmpdir()/crewcontrol-storage-tmp`.
   Every call site in this migration cleans up after itself (including on
   error paths), but if the process crashes mid-request a stray temp file
   could theoretically be left behind. Worth a cron/cleanup job if you don't
   already have one (`storageGovernance.cleanupScheduleMs` in `env.js`
   suggests you might already run something like this for other purposes).
4. I did not modify `models/FileRecord.js`, `scripts/migrate-local-to-r2.js`,
   or any Mongoose schema — the `storageDriver`/`storageKey` fields you
   already had were exactly what this needed.

## Not touched, and why
- `ai-services/` (Python) — no S3/R2 client present or needed; see scope
  notes above.
- `services/upload.service.js` — this is an unused stub
  (`export const uploadFile = async (filePath) => ({ path: filePath })`);
  the real upload path is `controllers/upload.controller.js` →
  `saveBuffer()`, which was already storage-abstracted.
- `controllers/attendance.controller.js` — only ever passes timesheet path
  *strings* around; no direct fs access.
