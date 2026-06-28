PHASE M1 - OWNERID BACKFILL (DRY-RUN SCRIPTS)

Files created (dry-run, no writes):
- `migrations/dryrun/employee_backfill_dryrun.js` — scans `Employee` and proposes `{ filter, update, derivedFrom, confidence }` operations. Derivation: `owner` -> `ownerId`, fallback `company.owner`.
- `migrations/dryrun/attendance_backfill_dryrun.js` — scans `Attendance` and proposes per-document updates deriving ownerId via referenced `Employee` (employee.owner or employee.company.owner).
- `migrations/dryrun/invoice_backfill_dryrun.js` — scans `Invoice` and proposes updates: `company.owner` -> ownerId; fallback `createdBy`.
- `migrations/dryrun/attendanceimport_backfill_dryrun.js` — scans `AttendanceImport` and proposes updates: `company.owner` -> ownerId.

How the dry-run scripts behave
- They connect to MongoDB (read-only) using `MONGODB_URI` from environment.
- They compute derived `ownerId` per document and write a JSON file under `migrations/dryrun/*_ops.json` containing the exact `filter` and `update` objects that would be executed.
- They do NOT perform updates.

PHASE M2 - FILE MIGRATION (PLAN GENERATION)

Files created:
- `scripts/generate_file_records_plan.js` — reads `scripts/file_record_migration_analysis_report.json` and generates `scripts/file_record_migration_plan.json` listing the `safelyMappable` 51 files and suggested `FileRecord` documents (ownerId, companyId, path, purpose, confidence).

PHASE M3 - IMPLEMENTATION (DOCUMENTATION)

1) Updated Schemas (proposed, backward-compatible additions)
- Add `ownerId` to these schemas (type: `ObjectId`, ref: 'User') with `index: true`:
  - `Employee` (in addition to existing `owner`): `ownerId` (nullable)
  - `Attendance`: `ownerId` (nullable)
  - `Invoice`: `ownerId` (nullable)
  - `AttendanceImport`: `ownerId` (nullable)
  - `FileRecord` (already has `ownerId`)

2) Updated Indexes
- Create indexes to support queries and enforce tenancy checks:
  - `Employee`: index on `{ ownerId: 1 }`
  - `Attendance`: compound index `{ ownerId:1, company:1, employee:1, date:-1 }`
  - `Invoice`: index `{ ownerId:1, company:1 }`
  - `AttendanceImport`: index `{ ownerId:1, company:1 }`
  - `FileRecord`: ensure `{ path:1 }` unique or indexed (already present)

3) Migration execution plan (dry-run -> staged -> commit)
- Phase 0: Review & backups
  - Take a logical DB backup (mongodump) of production collections involved.
  - Freeze writes to critical endpoints if possible (short maintenance window) or run idempotent migrations.
- Phase 1: Schema deploy (read-only safe)
  - Deploy schema changes adding `ownerId` fields (no required constraint), and add indexes. This is backward compatible.
  - Deploy tenant helper changes to read `ownerId` when present and fallback to `owner`/`company.owner` when absent.
- Phase 2: Dry-run (run scripts created)
  - Execute each dry-run script with `MONGODB_URI` to produce `*_ops.json` files and `file_record_migration_plan.json`.
  - QA: Review counts, random sample checks, and compare with expected derivation.
- Phase 3: Staged apply (small batches, audit)
  - For each collection, run updates in small batches (e.g., 1000 docs) using the computed operations, record results in a migration log collection `MigrationRun` (only meta — NO owner changes logged elsewhere).
  - After each batch, run verification queries to confirm `ownerId` set and tenant filters still work.
- Phase 4: Final verification & cleanup
  - Once all collections migrated and verified, remove fallback code paths (if desired) and optionally mark `owner` deprecated.

4) Rollback plan
- Because updates are additive (`$set: { ownerId: ... }`) and idempotent, rollback options:
  - Preferred: Keep previous state and only rollback by setting `ownerId` to null for affected documents using stored migration logs (maintain list of updated _ids). Use the migration log to perform revert updates.
  - If migration logs are not kept, restore from DB backup (mongorestore) taken prior to migration.

Notes & Safety
- All scripts in this repo are dry-run only and will not modify data unless explicitly changed to call `updateOne`/`updateMany`.
- Before executing any write migration, run these steps in a staging environment and validate sample subsets.
