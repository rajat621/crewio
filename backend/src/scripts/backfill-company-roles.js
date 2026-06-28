import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
const shouldApply = process.argv.includes('--apply');

const resolveRole = (company) => {
  if (company.isOwner === true) return 'owner';
  if (company.owner) return 'owner';
  return 'client';
};

const main = async () => {
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env file');
  }

  await mongoose.connect(uri);

  const companiesCollection = mongoose.connection.db.collection('companies');
  const companies = await companiesCollection
    .find({}, { projection: { _id: 1, name: 1, owner: 1, createdBy: 1, isOwner: 1, companyRole: 1 } })
    .toArray();

  let ownerCount = 0;
  let clientCount = 0;
  let willChangeCount = 0;

  const updates = [];

  for (const company of companies) {
    const targetRole = resolveRole(company);
    const targetIsOwner = targetRole === 'owner';

    if (targetRole === 'owner') ownerCount += 1;
    else clientCount += 1;

    const currentRole = company.companyRole;
    const currentIsOwner = Boolean(company.isOwner);
    const currentCreatedBy = company.createdBy || null;

    let targetCreatedBy = currentCreatedBy;
    if (targetRole === 'owner' && !targetCreatedBy) {
      // Prefer existing owner reference; fallback to company id to satisfy unique owner index.
      targetCreatedBy = company.owner || company._id;
    }

    const needsRoleUpdate = currentRole !== targetRole;
    const needsOwnerFlagUpdate = currentIsOwner !== targetIsOwner;
    const needsCreatedByUpdate = targetRole === 'owner' && String(currentCreatedBy || '') !== String(targetCreatedBy || '');

    if (needsRoleUpdate || needsOwnerFlagUpdate || needsCreatedByUpdate) {
      willChangeCount += 1;
      const setPatch = {
        companyRole: targetRole,
        isOwner: targetIsOwner,
      };

      if (targetRole === 'owner') {
        setPatch.createdBy = targetCreatedBy;
      }

      updates.push({
        updateOne: {
          filter: { _id: company._id },
          update: {
            $set: setPatch,
          },
        },
      });
    }
  }

  console.log('Company role migration preview:');
  console.log(`- Total companies: ${companies.length}`);
  console.log(`- Target owners: ${ownerCount}`);
  console.log(`- Target clients: ${clientCount}`);
  console.log(`- Records needing change: ${willChangeCount}`);

  if (!shouldApply) {
    console.log('Dry run only. Re-run with --apply to persist updates.');
    await mongoose.disconnect();
    return;
  }

  if (updates.length > 0) {
    await companiesCollection.bulkWrite(updates, { ordered: false });
  }

  console.log(`Applied updates: ${updates.length}`);
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error('Migration failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch (_e) {
    // no-op
  }
  process.exit(1);
});
