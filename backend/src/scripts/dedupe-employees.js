// backend/src/scripts/dedupe-employees.js
//
// Finds duplicate Employee records (same employeeId + ownerId - the exact
// bug a stuck/rapid-clicked "Save" used to produce before the double-submit
// guard existed, since nothing at the database level ever rejected the
// repeat insert) and merges each group down to one record.
//
// For every duplicate group:
//   - The "winner" is the most complete record (most populated profile
//     fields; ties broken by most recently updated).
//   - Every OTHER collection that references a loser's _id (attendance,
//     salary slips, work sessions, location history, employee documents,
//     chat messages, notifications) is re-pointed at the winner's _id
//     first, so no historical data is silently orphaned or lost.
//   - Each loser's embedded expense/deduction records (expenses.records)
//     are merged into the winner's - these represent real transaction
//     history for the same actual person and must not be discarded.
//   - Only after all of the above succeeds are the loser documents deleted.
//
// SAFE BY DEFAULT: this only ever REPORTS what it would do. Nothing in the
// database is touched unless you pass --apply, exactly like the existing
// backfill-company-roles.js script in this same folder.
//
//   node src/scripts/dedupe-employees.js            (dry run - report only)
//   node src/scripts/dedupe-employees.js --apply     (actually merge/delete)
//
// Run this BEFORE deploying the new unique index on Employee.js
// ({employeeId, ownerId}) - MongoDB will refuse to build that index while
// duplicates still exist.

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
const shouldApply = process.argv.includes('--apply');

// Fields that make up "how complete this employee's profile is" - counted
// to pick which duplicate survives. Deliberately excludes internal/runtime
// fields (tokenVersion, failedLoginAttempts, lockUntil, appPassword hash,
// fcmToken, boundDeviceId, lastLocation) - those describe system state, not
// how filled-out the person's actual record is.
const COMPLETENESS_FIELDS = [
  'firstName', 'lastName', 'name', 'gender', 'dateOfBirth', 'email',
  'mobile', 'mobileNumber', 'nationality', 'state', 'city', 'address',
  'position', 'trade', 'department', 'salary', 'ratePerHour', 'joiningDate',
  'joinDate', 'passportNo', 'passportExpiry', 'passportCopy', 'emiratesId',
  'emiratesIdExpiry', 'emiratesIdCopy', 'laborCardCopy',
  'medicalCertificateCopy', 'residenceIdCopy', 'contractPaperCopy',
  'avatar', 'company',
];

// Every OTHER collection that can reference an Employee's _id, and the
// field it's stored under - each gets a bulk re-point from loser -> winner
// before the loser is deleted.
const REFERENCING_COLLECTIONS = [
  { collection: 'employeedocuments', field: 'employee' },
  { collection: 'worksessions', field: 'employee' },
  { collection: 'employeelocations', field: 'employee' },
  { collection: 'attendances', field: 'employee' },
  { collection: 'salaryslips', field: 'employee' },
  // Notification.user and Chat.from/Chat.to are typed ref:'User' in their
  // schemas but, in practice, also hold Employee _ids (see
  // notification.controller.js / chat.controller.js) - they need
  // re-pointing too, or a loser's notifications/messages would silently
  // vanish once that _id no longer exists.
  { collection: 'notifications', field: 'user' },
  { collection: 'chats', field: 'from' },
  { collection: 'chats', field: 'to' },
];

const isPopulated = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const completenessScore = (employee) =>
  COMPLETENESS_FIELDS.reduce((score, field) => score + (isPopulated(employee[field]) ? 1 : 0), 0);

const pickWinner = (group) => {
  const sorted = [...group].sort((a, b) => {
    const scoreDiff = completenessScore(b) - completenessScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    // Tie-break: most recently updated wins.
    const aUpdated = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bUpdated = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bUpdated - aUpdated;
  });
  return sorted[0];
};

const main = async () => {
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env file');
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const employees = db.collection('employees');

  // Verify every collection name this script assumes actually exists -
  // a wrong guess would otherwise just silently return 0 matches (Mongo
  // doesn't error on querying a non-existent collection), which could
  // make this miss real references without any warning at all.
  const actualCollectionNames = new Set(
    (await db.listCollections().toArray()).map((c) => c.name)
  );
  const uniqueAssumedNames = [...new Set(REFERENCING_COLLECTIONS.map((r) => r.collection))];
  const missingCollections = uniqueAssumedNames.filter((name) => !actualCollectionNames.has(name));
  if (missingCollections.length > 0) {
    console.warn(
      `⚠ These expected collections were not found in the database: ${missingCollections.join(', ')}. ` +
      'If your database uses different collection names, update REFERENCING_COLLECTIONS at the top of this script before trusting its output.'
    );
    console.warn('');
  }

  // Group by (employeeId, ownerId) - mirrors the new unique index exactly.
  const duplicateGroups = await employees
    .aggregate([
      { $match: { employeeId: { $type: 'string', $ne: '' } } },
      {
        $group: {
          _id: { employeeId: '$employeeId', ownerId: '$ownerId' },
          count: { $sum: 1 },
          ids: { $push: '$_id' },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (duplicateGroups.length === 0) {
    console.log('No duplicate employees found. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${duplicateGroups.length} duplicate group(s).`);
  console.log(shouldApply ? 'Running in APPLY mode - changes will be made.' : 'Running in DRY-RUN mode - no changes will be made (pass --apply to commit).');
  console.log('');

  let totalDeleted = 0;
  let totalReferencesMigrated = 0;
  const appUserIdWarnings = [];

  for (const group of duplicateGroups) {
    const docs = await employees.find({ _id: { $in: group.ids } }).toArray();
    const winner = pickWinner(docs);
    const losers = docs.filter((d) => String(d._id) !== String(winner._id));

    console.log(`Group: employeeId=${group._id.employeeId} ownerId=${group._id.ownerId} (${docs.length} records)`);
    console.log(`  Winner: ${winner._id} (name="${winner.name || ''}", completeness=${completenessScore(winner)})`);

    // Flag distinct mobile-login credentials on losers - these become
    // unreachable once the loser is deleted. Never auto-resolved; this is
    // reported so you can decide whether the affected employee needs a
    // fresh mobile login before/after the merge.
    for (const loser of losers) {
      if (loser.appUserId && loser.appUserId !== winner.appUserId) {
        appUserIdWarnings.push({
          employeeId: group._id.employeeId,
          winnerId: String(winner._id),
          loserId: String(loser._id),
          loserAppUserId: loser.appUserId,
        });
      }
    }

    for (const loser of losers) {
      console.log(`  Merging loser: ${loser._id} (completeness=${completenessScore(loser)}) -> winner ${winner._id}`);

      // Re-point every referencing collection from loser -> winner.
      for (const { collection, field } of REFERENCING_COLLECTIONS) {
        const target = db.collection(collection);
        const matchCount = await target.countDocuments({ [field]: loser._id });
        if (matchCount === 0) continue;

        totalReferencesMigrated += matchCount;
        console.log(`    ${collection}.${field}: ${matchCount} record(s) to re-point`);
        if (shouldApply) {
          await target.updateMany({ [field]: loser._id }, { $set: { [field]: winner._id } });
        }
      }

      // Merge the loser's expense/deduction history into the winner's -
      // this is real transaction history for the same actual person.
      const loserRecords = Array.isArray(loser.expenses?.records) ? loser.expenses.records : [];
      if (loserRecords.length > 0) {
        console.log(`    expenses.records: ${loserRecords.length} entr${loserRecords.length === 1 ? 'y' : 'ies'} to merge`);
        if (shouldApply) {
          await employees.updateOne(
            { _id: winner._id },
            { $push: { 'expenses.records': { $each: loserRecords } } }
          );
        }
      }

      if (shouldApply) {
        await employees.deleteOne({ _id: loser._id });
      }
      totalDeleted += 1;
    }

    console.log('');
  }

  console.log('--- Summary ---');
  console.log(`Duplicate groups: ${duplicateGroups.length}`);
  console.log(`Records ${shouldApply ? 'deleted' : 'that would be deleted'}: ${totalDeleted}`);
  console.log(`References ${shouldApply ? 'migrated' : 'that would be migrated'}: ${totalReferencesMigrated}`);

  if (appUserIdWarnings.length > 0) {
    console.log('');
    console.log(`⚠ ${appUserIdWarnings.length} loser record(s) had a DIFFERENT mobile login (appUserId) than the winner they were merged into:`);
    appUserIdWarnings.forEach((w) => {
      console.log(`  employeeId=${w.employeeId}: loser ${w.loserId} had appUserId="${w.loserAppUserId}" (winner is ${w.winnerId})`);
    });
    console.log('  If that employee has been logging into the mobile app, confirm which credentials they actually use before/after this merge.');
  }

  if (!shouldApply) {
    console.log('');
    console.log('This was a dry run - no changes were made. Re-run with --apply to actually merge and delete.');
  }

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error('Dedupe script failed:', error);
  process.exit(1);
});
